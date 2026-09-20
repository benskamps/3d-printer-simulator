import {
  HeaterTelemetry,
  IThermalModel,
  PIDGains,
  ThermalPhysicalParams,
} from './types';
import { PIDController } from './PIDController';
import { IThermalSubsystemBridge } from '../gcode/types';

export interface ThermalModelOptions {
  ambientTemp?: number;
  hotendParams?: Partial<ThermalPhysicalParams>;
  bedParams?: Partial<ThermalPhysicalParams>;
  hotendGains?: Partial<PIDGains>;
  bedGains?: Partial<PIDGains>;
}

/**
 * Analytical Exponential Discrete Thermal Model with Marlin/Klipper-spec
 * Safety Watchdogs and Tuned Discrete PID Controllers.
 */
export class ThermalModel implements IThermalModel, IThermalSubsystemBridge {
  // Physical parameters
  private readonly ambientTemp: number;
  private readonly hotendParams: ThermalPhysicalParams;
  private readonly bedParams: ThermalPhysicalParams;

  // PID Controllers
  private hotendPID: PIDController;
  private bedPID: PIDController;

  // Current states
  private hotendActual: number;
  private hotendTarget: number = 0;
  private hotendPower: number = 0;

  private bedActual: number;
  private bedTarget: number = 0;
  private bedPower: number = 0;

  // Active fan speed duty cycle [0.0 - 1.0]
  private fanSpeed: number = 0;

  // Safety & Watchdog states
  private hasError: boolean = false;
  private isRunaway: boolean = false;
  private errorReason: string = '';

  // Cold extrusion threshold
  private readonly coldExtrusionThreshold: number = 170.0;

  // Hotend Watchdog states
  private hotendHeatingWatchdogTimer: number = 0;
  private hotendHeatingWatchdogStartTemp: number;
  private hotendInRangeReached: boolean = false;
  private hotendInRangeDriftTimer: number = 0;
  private readonly hotendTauWatch: number = 25.0; // 25s window to rise >= 2°C

  // Bed Watchdog states
  private bedHeatingWatchdogTimer: number = 0;
  private bedHeatingWatchdogStartTemp: number;
  private bedInRangeReached: boolean = false;
  private bedInRangeDriftTimer: number = 0;
  private readonly bedTauWatch: number = 60.0; // 60s window to rise >= 2°C

  // Simulation fault injection
  private simulateHotendFailure: boolean = false;
  private simulateBedFailure: boolean = false;

  constructor(options?: ThermalModelOptions) {
    this.ambientTemp = options?.ambientTemp ?? 21.0;

    // Calibrated Hotend defaults: 40W, ambient to 285°C
    this.hotendParams = {
      ambientTemp: this.ambientTemp,
      maxTemp: 285.0,
      kHeat: 3.80,
      kCool: 0.0145,
      // A part-cooling fan blows across the print, not the heater block, so it
      // costs the hotend headroom rather than control of it. These constants put
      // the saturated steady state at ~283 C with the fan off and ~260 C with it
      // at 100%, which keeps every normal setpoint reachable under full cooling.
      kFan: 0.0014,
      ...options?.hotendParams,
    };

    // Calibrated Bed defaults: 220W, ambient to 115°C
    this.bedParams = {
      ambientTemp: this.ambientTemp,
      maxTemp: 115.0,
      kHeat: 0.42,
      kCool: 0.0036,
      kFan: 0.0002,
      ...options?.bedParams,
    };

    // Tuned PID gains
    const hotendGains: PIDGains = {
      kp: 0.045,
      ki: 0.0018,
      kd: 0.280,
      ...options?.hotendGains,
    };

    const bedGains: PIDGains = {
      kp: 0.120,
      ki: 0.0004,
      kd: 1.100,
      ...options?.bedGains,
    };

    this.hotendPID = new PIDController(hotendGains, 0.75);
    this.bedPID = new PIDController(bedGains, 0.40);

    this.hotendActual = this.ambientTemp;
    this.bedActual = this.ambientTemp;

    this.hotendHeatingWatchdogStartTemp = this.ambientTemp;
    this.bedHeatingWatchdogStartTemp = this.ambientTemp;
  }

  /**
   * Primary simulation tick: advances temperatures using analytical exponential integration.
   * Employs sub-stepping (maximum 0.1s step) to ensure numerical precision and PID stability.
   */
  public update(deltaTimeSeconds: number): void {
    if (deltaTimeSeconds <= 0) return;

    // Sub-stepping to maintain discrete PID and watchdog accuracy
    const maxSubStep = 0.1;
    let remaining = deltaTimeSeconds;

    while (remaining > 0.0001) {
      const step = Math.min(remaining, maxSubStep);
      this.stepSimulation(step);
      remaining -= step;
    }
  }

  private stepSimulation(dt: number): void {
    // 1. Check Sensor Open/Short Limits (MINTEMP / MAXTEMP)
    if (this.hotendActual < -10.0 || this.bedActual < -10.0) {
      this.tripWatchdog('MINTEMP: Thermistor wire open circuit or disconnected!');
      return;
    }
    if (this.hotendActual > 310.0 || this.bedActual > 130.0) {
      this.tripWatchdog('MAXTEMP: Temperature exceeded safety limit!');
      return;
    }

    // 2. If halted or in error state, force zero heating and max cooling
    if (this.hasError || this.isRunaway) {
      this.hotendPower = 0;
      this.bedPower = 0;
      // Exponential cooling towards ambient
      this.hotendActual = this.computeAnalyticalTemp(
        this.hotendActual,
        this.ambientTemp,
        0,
        this.hotendParams.kHeat,
        this.hotendParams.kCool + this.hotendParams.kFan * this.fanSpeed,
        dt
      );
      this.bedActual = this.computeAnalyticalTemp(
        this.bedActual,
        this.ambientTemp,
        0,
        this.bedParams.kHeat,
        this.bedParams.kCool + this.bedParams.kFan * this.fanSpeed,
        dt
      );
      return;
    }

    // 3. Normal PID temperature regulation
    this.hotendPower = this.hotendPID.update(this.hotendTarget, this.hotendActual, dt);
    this.bedPower = this.bedPID.update(this.bedTarget, this.bedActual, dt);

    // Effective power delivered to heater cartridge (simulated failure detachment delivers 0)
    const effectiveHotendPower = this.simulateHotendFailure ? 0 : this.hotendPower;
    const effectiveBedPower = this.simulateBedFailure ? 0 : this.bedPower;

    // Effective cooling constant: lambda = k_cool + k_fan * fanSpeed
    const hotendLambda = this.hotendParams.kCool + this.hotendParams.kFan * this.fanSpeed;
    const bedLambda = this.bedParams.kCool + this.bedParams.kFan * this.fanSpeed;

    // 4. Analytical Exponential ODE update
    this.hotendActual = this.computeAnalyticalTemp(
      this.hotendActual,
      this.ambientTemp,
      effectiveHotendPower,
      this.hotendParams.kHeat,
      hotendLambda,
      dt
    );

    this.bedActual = this.computeAnalyticalTemp(
      this.bedActual,
      this.ambientTemp,
      effectiveBedPower,
      this.bedParams.kHeat,
      bedLambda,
      dt
    );

    // 5. Evaluate Safety Watchdogs
    this.evaluateHotendWatchdogs(dt);
    this.evaluateBedWatchdogs(dt);
  }

  /**
   * Exact discrete solution of: dT/dt = u*k_heat - lambda*(T - T_ambient)
   * T(t + dt) = T_infinity + (T(t) - T_infinity) * e^(-lambda * dt)
   */
  private computeAnalyticalTemp(
    tCurrent: number,
    tAmb: number,
    u: number,
    kHeat: number,
    lambda: number,
    dt: number
  ): number {
    if (lambda <= 0.000001) return tCurrent;
    const tInf = tAmb + (u * kHeat) / lambda;
    return tInf + (tCurrent - tInf) * Math.exp(-lambda * dt);
  }

  private evaluateHotendWatchdogs(dt: number): void {
    // 1. Heating Watchdog (Rise Check)
    if (this.hotendTarget >= this.hotendActual + 5.0) {
      if (this.hotendPower >= 0.85) {
        this.hotendHeatingWatchdogTimer += dt;
        if (this.hotendHeatingWatchdogTimer >= this.hotendTauWatch) {
          const tempRise = this.hotendActual - this.hotendHeatingWatchdogStartTemp;
          if (tempRise < 2.0) {
            this.tripWatchdog(
              `Thermal Runaway: Hotend failed to rise by 2°C within ${this.hotendTauWatch}s!`
            );
            return;
          } else {
            // Temperature rose sufficiently, advance window
            this.hotendHeatingWatchdogTimer = 0;
            this.hotendHeatingWatchdogStartTemp = this.hotendActual;
          }
        }
      } else {
        // Not at saturated power, keep window reset
        this.hotendHeatingWatchdogTimer = 0;
        this.hotendHeatingWatchdogStartTemp = this.hotendActual;
      }
    } else {
      this.hotendHeatingWatchdogTimer = 0;
      this.hotendHeatingWatchdogStartTemp = this.hotendActual;
    }

    // 2. In-Range Watchdog (Stability Check)
    if (this.hotendTarget > 40.0) {
      if (Math.abs(this.hotendActual - this.hotendTarget) <= 3.0) {
        this.hotendInRangeReached = true;
      }

      if (this.hotendInRangeReached) {
        if (this.hotendActual < this.hotendTarget - 10.0 && this.hotendPower >= 0.90) {
          this.hotendInRangeDriftTimer += dt;
          if (this.hotendInRangeDriftTimer >= 15.0) {
            this.tripWatchdog(
              'Thermal Runaway: Hotend dropped > 10°C below setpoint for > 15s under full power!'
            );
            return;
          }
        } else {
          this.hotendInRangeDriftTimer = 0;
        }
      }
    } else {
      this.hotendInRangeReached = false;
      this.hotendInRangeDriftTimer = 0;
    }
  }

  private evaluateBedWatchdogs(dt: number): void {
    // 1. Heating Watchdog (Rise Check)
    if (this.bedTarget >= this.bedActual + 5.0) {
      if (this.bedPower >= 0.85) {
        this.bedHeatingWatchdogTimer += dt;
        if (this.bedHeatingWatchdogTimer >= this.bedTauWatch) {
          const tempRise = this.bedActual - this.bedHeatingWatchdogStartTemp;
          if (tempRise < 2.0) {
            this.tripWatchdog(
              `Thermal Runaway: Bed failed to rise by 2°C within ${this.bedTauWatch}s!`
            );
            return;
          } else {
            this.bedHeatingWatchdogTimer = 0;
            this.bedHeatingWatchdogStartTemp = this.bedActual;
          }
        }
      } else {
        this.bedHeatingWatchdogTimer = 0;
        this.bedHeatingWatchdogStartTemp = this.bedActual;
      }
    } else {
      this.bedHeatingWatchdogTimer = 0;
      this.bedHeatingWatchdogStartTemp = this.bedActual;
    }

    // 2. In-Range Watchdog (Stability Check)
    if (this.bedTarget > 35.0) {
      if (Math.abs(this.bedActual - this.bedTarget) <= 3.0) {
        this.bedInRangeReached = true;
      }

      if (this.bedInRangeReached) {
        if (this.bedActual < this.bedTarget - 10.0 && this.bedPower >= 0.90) {
          this.bedInRangeDriftTimer += dt;
          if (this.bedInRangeDriftTimer >= 15.0) {
            this.tripWatchdog(
              'Thermal Runaway: Bed dropped > 10°C below setpoint for > 15s under full power!'
            );
            return;
          }
        } else {
          this.bedInRangeDriftTimer = 0;
        }
      }
    } else {
      this.bedInRangeReached = false;
      this.bedInRangeDriftTimer = 0;
    }
  }

  private tripWatchdog(reason: string): void {
    // Keep the first reason. M112 shutdown trips the same watchdog, so without
    // this guard the halt that follows a fault overwrites the fault that caused
    // it and the terminal reports the symptom instead of the cause.
    if (!this.hasError && !this.isRunaway) {
      this.errorReason = reason;
    }
    this.isRunaway = true;
    this.hasError = true;
    this.hotendPower = 0;
    this.bedPower = 0;
    this.hotendTarget = 0;
    this.bedTarget = 0;
    this.fanSpeed = 1.0; // 100% cooling fan on runaway
  }

  // --- IThermalModel Implementation ---

  public getHotend(): HeaterTelemetry {
    return {
      actual: this.hotendActual,
      target: this.hotendTarget,
      power: this.hotendPower,
      isHeating: this.hotendTarget > this.ambientTemp && this.hotendPower > 0.01,
      hasError: this.hasError,
    };
  }

  public getBed(): HeaterTelemetry {
    return {
      actual: this.bedActual,
      target: this.bedTarget,
      power: this.bedPower,
      isHeating: this.bedTarget > this.ambientTemp && this.bedPower > 0.01,
      hasError: this.hasError,
    };
  }

  public setHotendTarget(target: number): void {
    const clamped = Math.max(0, Math.min(this.hotendParams.maxTemp, target));
    if (Math.abs(clamped - this.hotendTarget) > 5.0) {
      this.hotendInRangeReached = false;
      this.hotendHeatingWatchdogTimer = 0;
      this.hotendHeatingWatchdogStartTemp = this.hotendActual;
    }
    this.hotendTarget = clamped;
  }

  public setBedTarget(target: number): void {
    const clamped = Math.max(0, Math.min(this.bedParams.maxTemp, target));
    if (Math.abs(clamped - this.bedTarget) > 5.0) {
      this.bedInRangeReached = false;
      this.bedHeatingWatchdogTimer = 0;
      this.bedHeatingWatchdogStartTemp = this.bedActual;
    }
    this.bedTarget = clamped;
  }

  public setFanSpeed(fanDutyCycle: number): void {
    this.fanSpeed = Math.max(0.0, Math.min(1.0, fanDutyCycle));
  }

  public isTargetReached(heater: 'hotend' | 'bed', toleranceCelsius: number = 1.0): boolean {
    if (heater === 'hotend') {
      if (this.hotendTarget <= 0) return true;
      return Math.abs(this.hotendActual - this.hotendTarget) <= toleranceCelsius;
    } else {
      if (this.bedTarget <= 0) return true;
      return Math.abs(this.bedActual - this.bedTarget) <= toleranceCelsius;
    }
  }

  public canExtrude(): boolean {
    return this.hotendActual >= this.coldExtrusionThreshold && !this.hasError && !this.isRunaway;
  }

  public isThermalRunaway(): boolean {
    return this.isRunaway || this.hasError;
  }

  public triggerEmergencyStop(): void {
    this.tripWatchdog('Emergency Stop (M112): Heater shutdown requested!');
  }

  public resetFaults(): void {
    this.isRunaway = false;
    this.hasError = false;
    this.errorReason = '';
    this.simulateHotendFailure = false;
    this.simulateBedFailure = false;
    this.hotendHeatingWatchdogTimer = 0;
    this.hotendHeatingWatchdogStartTemp = this.hotendActual;
    this.hotendInRangeReached = false;
    this.hotendInRangeDriftTimer = 0;
    this.bedHeatingWatchdogTimer = 0;
    this.bedHeatingWatchdogStartTemp = this.bedActual;
    this.bedInRangeReached = false;
    this.bedInRangeDriftTimer = 0;
    this.hotendPID.reset(this.hotendActual);
    this.bedPID.reset(this.bedActual);
  }

  // --- IThermalSubsystemBridge Implementation ---

  public getHotendTemp(): { actual: number; target: number } {
    return { actual: this.hotendActual, target: this.hotendTarget };
  }

  public getBedTemp(): { actual: number; target: number } {
    return { actual: this.bedActual, target: this.bedTarget };
  }

  public getColdExtrusionThreshold(): number {
    return this.coldExtrusionThreshold;
  }

  // --- Simulation and Diagnostic Helpers ---

  public getErrorReason(): string {
    return this.errorReason;
  }

  public getFanSpeed(): number {
    return this.fanSpeed;
  }

  public setSimulatedFailure(heater: 'hotend' | 'bed', active: boolean): void {
    if (heater === 'hotend') {
      this.simulateHotendFailure = active;
    } else {
      this.simulateBedFailure = active;
    }
  }

  /**
   * Directly inject temperature (e.g. for testing sensor faults or instant drops).
   */
  public setActualTemperatureDirect(heater: 'hotend' | 'bed', temp: number): void {
    if (heater === 'hotend') {
      this.hotendActual = temp;
      this.hotendHeatingWatchdogStartTemp = temp;
    } else {
      this.bedActual = temp;
      this.bedHeatingWatchdogStartTemp = temp;
    }
  }
}
