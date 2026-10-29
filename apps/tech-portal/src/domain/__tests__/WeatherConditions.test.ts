import { describe, test, expect } from 'vitest';
import { WeatherConditions } from '../WeatherConditions';

describe('WeatherConditions Value Object', () => {
  test('creates valid WeatherConditions from string inputs', () => {
    const weather = new WeatherConditions('72°F', '3 mph');
    expect(weather.getTemperatureFahrenheit()).toBe(72);
    expect(weather.getWindSpeedMph()).toBe(3);
    expect(weather.getFormattedTemperature()).toBe('72°F');
    expect(weather.getFormattedWindSpeed()).toBe('3 mph');
    expect(weather.toPayload()).toEqual({ temp: '72°F', windSpeed: '3 mph' });
    expect(weather.toString()).toBe('72°F, 3 mph');
  });

  test('creates valid WeatherConditions from numeric inputs', () => {
    const weather = new WeatherConditions(68, 5);
    expect(weather.getTemperatureFahrenheit()).toBe(68);
    expect(weather.getWindSpeedMph()).toBe(5);
    expect(weather.getFormattedTemperature()).toBe('68°F');
    expect(weather.getFormattedWindSpeed()).toBe('5 mph');
  });

  test('correctly evaluates EPA drift high wind risk', () => {
    const calm = new WeatherConditions('70°F', '4 mph');
    const breezy = new WeatherConditions('70°F', '10 mph');
    const windy = new WeatherConditions('70°F', '15 mph');

    expect(calm.isHighWindRisk()).toBe(false);
    expect(breezy.isHighWindRisk()).toBe(true);
    expect(windy.isHighWindRisk()).toBe(true);
    expect(calm.isHighWindRisk(5)).toBe(false);
    expect(calm.isHighWindRisk(3)).toBe(true);
  });

  test('throws error for invalid or out-of-bound temperature', () => {
    expect(() => new WeatherConditions('invalid', '5 mph')).toThrow(/Invalid temperature value/);
    expect(() => new WeatherConditions('-60°F', '5 mph')).toThrow(/out of realistic application bounds/);
    expect(() => new WeatherConditions('150°F', '5 mph')).toThrow(/out of realistic application bounds/);
  });

  test('throws error for invalid or negative wind speed', () => {
    expect(() => new WeatherConditions('70°F', 'invalid')).toThrow(/Invalid wind speed value/);
    expect(() => new WeatherConditions('70°F', '-2 mph')).toThrow(/Must be a non-negative number/);
    expect(() => new WeatherConditions('70°F', '120 mph')).toThrow(/exceeds realistic application limits/);
  });

  test('checks equality between WeatherConditions instances', () => {
    const w1 = new WeatherConditions('75°F', '8 mph');
    const w2 = new WeatherConditions(75, 8);
    const w3 = new WeatherConditions('75°F', '12 mph');

    expect(w1.equals(w2)).toBe(true);
    expect(w1.equals(w3)).toBe(false);
  });
});
