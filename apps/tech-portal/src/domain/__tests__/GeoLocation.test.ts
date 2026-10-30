import { describe, test, expect } from 'vitest';
import { GeoLocation } from '../GeoLocation';

describe('GeoLocation Value Object', () => {
  test('creates a valid GeoLocation instance with valid coordinates', () => {
    const loc = new GeoLocation(40.7128, -74.006);
    expect(loc.getLatitude()).toBe(40.7128);
    expect(loc.getLongitude()).toBe(-74.006);
    expect(loc.toTuple()).toEqual([40.7128, -74.006]);
    expect(loc.toString()).toBe('40.712800, -74.006000');
  });

  test('validates latitude bounds (-90 to +90)', () => {
    expect(() => new GeoLocation(-90.1, 0)).toThrow(/out of bounds/i);
    expect(() => new GeoLocation(90.1, 0)).toThrow(/out of bounds/i);
    expect(() => new GeoLocation(NaN, 0)).toThrow(/Invalid latitude/i);
    expect(new GeoLocation(-90, 0).getLatitude()).toBe(-90);
    expect(new GeoLocation(90, 0).getLatitude()).toBe(90);
  });

  test('validates longitude bounds (-180 to +180)', () => {
    expect(() => new GeoLocation(0, -180.1)).toThrow(/out of bounds/i);
    expect(() => new GeoLocation(0, 180.1)).toThrow(/out of bounds/i);
    expect(() => new GeoLocation(0, Infinity)).toThrow(/Invalid longitude/i);
    expect(new GeoLocation(0, -180).getLongitude()).toBe(-180);
    expect(new GeoLocation(0, 180).getLongitude()).toBe(180);
  });

  test('correctly evaluates equality between GeoLocation instances', () => {
    const loc1 = new GeoLocation(37.7749, -122.4194);
    const loc2 = new GeoLocation(37.7749, -122.4194);
    const loc3 = new GeoLocation(34.0522, -118.2437);

    expect(loc1.equals(loc2)).toBe(true);
    expect(loc1.equals(loc3)).toBe(false);
  });

  test('creates instance from tuple using fromTuple static method', () => {
    const loc = GeoLocation.fromTuple([51.5074, -0.1278]);
    expect(loc.getLatitude()).toBe(51.5074);
    expect(loc.getLongitude()).toBe(-0.1278);
  });

  test('calculates approximate distance using Haversine formula', () => {
    // New York City to Los Angeles (~2,451 miles / ~3,944 km)
    const nyc = new GeoLocation(40.7128, -74.006);
    const la = new GeoLocation(34.0522, -118.2437);

    const distMiles = nyc.distanceToInMiles(la);
    const distKm = nyc.distanceToInKm(la);

    expect(Math.round(distMiles)).toBeGreaterThan(2400);
    expect(Math.round(distMiles)).toBeLessThan(2500);

    expect(Math.round(distKm)).toBeGreaterThan(3900);
    expect(Math.round(distKm)).toBeLessThan(4000);
  });
});
