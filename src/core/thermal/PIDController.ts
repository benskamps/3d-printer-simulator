import { PIDGains } from './types';

/**
 * Discrete PID Temperature Controller with Anti-Windup Clamping
 * and Derivative-on-Measurement.
 */
export class PIDController {
  private kp: number;
  private ki: number;
  private kd: number;
  private maxI: number;

  private integral: number = 0;
  private lastActual: number | null = null;

  constructor(gains: PIDGains, maxI: number = 0.75) {
    this.kp = gains.kp;
    this.ki = gains.ki;
    this.kd = gains.kd;
    this.maxI = maxI;
  }

  /**
   * Compute normalized control effort u(t) in range [0.0, 1.0].
   *
   * @param target Commanded setpoint (°C)
   * @param actual Current measured temperature (°C)
   * @param dt Elapsed time delta (seconds)
   */
  public update(target: number, actual: number, dt: number): number {
    if (target <= 0 || dt <= 0) {
      this.integral = 0;
      this.lastActual = actual;
      return 0.0;
    }

    const error = target - actual;

    // Proportional term
    const termP = this.kp * error;

    // Derivative on measurement: -Kd * (dActual / dt)
    let termD = 0.0;
    if (this.lastActual !== null && dt > 0) {
      const dMeas = (actual - this.lastActual) / dt;
      termD = -this.kd * dMeas;
    }
    this.lastActual = actual;

    // Integral term with anti-windup clamping to [0.0, maxI]
    this.integral += error * dt;
    if (this.ki > 0) {
      const maxIntegral = this.maxI / this.ki;
      this.integral = Math.max(0, Math.min(maxIntegral, this.integral));
    } else {
      this.integral = 0;
    }
    const termI = this.ki * this.integral;

    // Output clamped to [0.0, 1.0]
    const rawOutput = termP + termI + termD;
    return Math.max(0.0, Math.min(1.0, rawOutput));
  }

  public reset(actual?: number): void {
    this.integral = 0;
    this.lastActual = actual !== undefined ? actual : null;
  }

  public getIntegral(): number {
    return this.integral;
  }

  public getMaxI(): number {
    return this.maxI;
  }

  public setMaxI(maxI: number): void {
    this.maxI = maxI;
  }

  public getGains(): PIDGains {
    return { kp: this.kp, ki: this.ki, kd: this.kd };
  }

  public setGains(gains: Partial<PIDGains>): void {
    if (gains.kp !== undefined) this.kp = gains.kp;
    if (gains.ki !== undefined) this.ki = gains.ki;
    if (gains.kd !== undefined) this.kd = gains.kd;
  }
}
