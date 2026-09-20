/**
 * Thermal Dynamics and Safety type definitions
 * Compliant with PROJECT.md and Marlin/Klipper specifications.
 */

export interface HeaterTelemetry {
  actual: number;      // Current measured temperature (°C)
  target: number;      // Commanded target setpoint (°C)
  power: number;       // Normalized PWM output [0.0 - 1.0]
  isHeating: boolean;  // True if target > ambient and heating active
  hasError: boolean;   // True if runaway or sensor fault active
}

export interface ThermalHistoryPoint {
  timestamp: number;   // Timestamp (ms)
  hotendActual: number;
  hotendTarget: number;
  bedActual: number;
  bedTarget: number;
}

export interface ThermalPhysicalParams {
  ambientTemp: number;     // Ambient room temperature (°C), e.g. 21.0
  maxTemp: number;         // Safe maximum operating temperature (°C)
  kHeat: number;           // Heating rate constant (°C/s per unit power)
  kCool: number;           // Passive convective/radiative cooling rate constant (s^-1)
  kFan: number;            // Active fan cooling multiplier (s^-1)
}

export interface PIDGains {
  kp: number;
  ki: number;
  kd: number;
}

export interface IThermalModel {
  update(deltaTimeSeconds: number): void;
  getHotend(): HeaterTelemetry;
  getBed(): HeaterTelemetry;
  setHotendTarget(target: number): void;
  setBedTarget(target: number): void;
  setFanSpeed(fanDutyCycle: number): void;
  isTargetReached(heater: 'hotend' | 'bed', toleranceCelsius: number): boolean;
  canExtrude(): boolean; // Checks hotend >= 170°C
  isThermalRunaway(): boolean;
  triggerEmergencyStop(): void;
  resetFaults(): void;
}
