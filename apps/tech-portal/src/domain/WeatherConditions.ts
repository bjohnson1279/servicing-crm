/**
 * Value Object representing Weather Conditions during chemical application.
 * Enforces domain invariants for temperature and wind speed for regulatory/EPA compliance.
 */
export class WeatherConditions {
  private static readonly DEFAULT_HIGH_WIND_THRESHOLD_MPH = 10;

  private readonly temperatureFahrenheit: number;
  private readonly windSpeedMph: number;

  constructor(temp: number | string, windSpeed: number | string) {
    const parsedTemp = WeatherConditions.parseTemperature(temp);
    const parsedWind = WeatherConditions.parseWindSpeed(windSpeed);

    if (isNaN(parsedTemp) || !isFinite(parsedTemp)) {
      throw new Error(`Invalid temperature value: '${temp}'. Must be a valid number.`);
    }

    if (parsedTemp < -50 || parsedTemp > 130) {
      throw new Error(
        `Temperature '${temp}' is out of realistic application bounds (-50°F to 130°F).`
      );
    }

    if (isNaN(parsedWind) || !isFinite(parsedWind) || parsedWind < 0) {
      throw new Error(
        `Invalid wind speed value: '${windSpeed}'. Must be a non-negative number.`
      );
    }

    if (parsedWind > 100) {
      throw new Error(
        `Wind speed '${windSpeed}' exceeds realistic application limits (max 100 mph).`
      );
    }

    this.temperatureFahrenheit = parsedTemp;
    this.windSpeedMph = parsedWind;
  }

  private static parseTemperature(val: number | string): number {
    if (typeof val === 'number') return val;
    if (typeof val !== 'string') return NaN;
    const clean = val.replace(/°[FCfc]|deg|F|f/gi, '').trim();
    return parseFloat(clean);
  }

  private static parseWindSpeed(val: number | string): number {
    if (typeof val === 'number') return val;
    if (typeof val !== 'string') return NaN;
    const clean = val.replace(/mph|km\/h|knots|kph/gi, '').trim();
    return parseFloat(clean);
  }

  public getTemperatureFahrenheit(): number {
    return this.temperatureFahrenheit;
  }

  public getWindSpeedMph(): number {
    return this.windSpeedMph;
  }

  public getFormattedTemperature(): string {
    return `${this.temperatureFahrenheit}°F`;
  }

  public getFormattedWindSpeed(): string {
    return `${this.windSpeedMph} mph`;
  }

  public isHighWindRisk(thresholdMph: number = WeatherConditions.DEFAULT_HIGH_WIND_THRESHOLD_MPH): boolean {
    return this.windSpeedMph >= thresholdMph;
  }

  public toPayload(): { temp: string; windSpeed: string } {
    return {
      temp: this.getFormattedTemperature(),
      windSpeed: this.getFormattedWindSpeed(),
    };
  }

  public equals(other: WeatherConditions): boolean {
    if (!other) return false;
    return (
      this.temperatureFahrenheit === other.getTemperatureFahrenheit() &&
      this.windSpeedMph === other.getWindSpeedMph()
    );
  }

  public toString(): string {
    return `${this.getFormattedTemperature()}, ${this.getFormattedWindSpeed()}`;
  }
}
