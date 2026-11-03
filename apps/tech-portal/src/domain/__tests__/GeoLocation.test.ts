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

  test('validates coordinate correctness using isValid static method', () => {
    // Valid standard and boundary coordinates
    expect(GeoLocation.isValid(37.7749, -122.4194)).toBe(true);
    expect(GeoLocation.isValid(0, 0)).toBe(true);
    expect(GeoLocation.isValid(-90, 0)).toBe(true);
    expect(GeoLocation.isValid(90, 0)).toBe(true);
    expect(GeoLocation.isValid(0, -180)).toBe(true);
    expect(GeoLocation.isValid(0, 180)).toBe(true);
    expect(GeoLocation.isValid(-90, -180)).toBe(true);
    expect(GeoLocation.isValid(90, 180)).toBe(true);

    // Latitude out of bounds
    expect(GeoLocation.isValid(-90.0001, 0)).toBe(false);
    expect(GeoLocation.isValid(90.0001, 0)).toBe(false);
    expect(GeoLocation.isValid(-100, 0)).toBe(false);
    expect(GeoLocation.isValid(100, 0)).toBe(false);

    // Longitude out of bounds
    expect(GeoLocation.isValid(0, -180.0001)).toBe(false);
    expect(GeoLocation.isValid(0, 180.0001)).toBe(false);
    expect(GeoLocation.isValid(0, -200)).toBe(false);
    expect(GeoLocation.isValid(0, 200)).toBe(false);

    // Non-finite and NaN values
    expect(GeoLocation.isValid(NaN, 0)).toBe(false);
    expect(GeoLocation.isValid(0, NaN)).toBe(false);
    expect(GeoLocation.isValid(Infinity, 0)).toBe(false);
    expect(GeoLocation.isValid(-Infinity, 0)).toBe(false);
    expect(GeoLocation.isValid(0, Infinity)).toBe(false);
    expect(GeoLocation.isValid(0, -Infinity)).toBe(false);

    // Non-numeric types
    expect(GeoLocation.isValid('40.7128' as any, -74.006)).toBe(false);
    expect(GeoLocation.isValid(40.7128, '-74.006' as any)).toBe(false);
    expect(GeoLocation.isValid(null as any, undefined as any)).toBe(false);
  });

  test('throws error for invalid tuple inputs in fromTuple', () => {
    // Non-array inputs
    expect(() => GeoLocation.fromTuple(null as any)).toThrow(/Invalid coordinate tuple/);
    expect(() => GeoLocation.fromTuple(undefined as any)).toThrow(/Invalid coordinate tuple/);
    expect(() => GeoLocation.fromTuple('40.7128, -74.006' as any)).toThrow(/Invalid coordinate tuple/);
    expect(() => GeoLocation.fromTuple(12345 as any)).toThrow(/Invalid coordinate tuple/);

    // Wrong array lengths
    expect(() => GeoLocation.fromTuple([] as any)).toThrow(/Invalid coordinate tuple/);
    expect(() => GeoLocation.fromTuple([40.7128] as any)).toThrow(/Invalid coordinate tuple/);
    expect(() => GeoLocation.fromTuple([40.7128, -74.006, 100] as any)).toThrow(/Invalid coordinate tuple/);

    // Coordinates out of bounds inside tuple
    expect(() => GeoLocation.fromTuple([95, 0])).toThrow(/out of bounds/i);
    expect(() => GeoLocation.fromTuple([0, 200])).toThrow(/out of bounds/i);
  });

  test('validates non-numeric types and infinities in constructor', () => {
    expect(() => new GeoLocation('40.7128' as any, -74.006)).toThrow(/Invalid latitude value/);
    expect(() => new GeoLocation(null as any, -74.006)).toThrow(/Invalid latitude value/);
    expect(() => new GeoLocation(-Infinity, 0)).toThrow(/Invalid latitude value/);
    expect(() => new GeoLocation(Infinity, 0)).toThrow(/Invalid latitude value/);

    expect(() => new GeoLocation(40.7128, '-74.006' as any)).toThrow(/Invalid longitude value/);
    expect(() => new GeoLocation(40.7128, undefined as any)).toThrow(/Invalid longitude value/);
    expect(() => new GeoLocation(0, -Infinity)).toThrow(/Invalid longitude value/);
    expect(() => new GeoLocation(0, Infinity)).toThrow(/Invalid longitude value/);
  });

  test('safely evaluates equality with null, undefined, self, and mismatched coordinates', () => {
    const loc = new GeoLocation(40.7128, -74.006);

    // Null and undefined
    expect(loc.equals(null as any)).toBe(false);
    expect(loc.equals(undefined as any)).toBe(false);

    // Self equality
    expect(loc.equals(loc)).toBe(true);

    // Differing latitude only
    expect(loc.equals(new GeoLocation(41.7128, -74.006))).toBe(false);

    // Differing longitude only
    expect(loc.equals(new GeoLocation(40.7128, -75.006))).toBe(false);
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

    // Consistent conversion ratio between miles and km (~1.609)
    expect(distKm / distMiles).toBeCloseTo(1.609, 2);
  });

  test('throws error when distance is calculated with null or undefined target', () => {
    const loc = new GeoLocation(40.7128, -74.006);

    expect(() => loc.distanceToInMiles(null as any)).toThrow(
      'Target location is required to calculate distance.'
    );
    expect(() => loc.distanceToInKm(undefined as any)).toThrow(
      'Target location is required to calculate distance.'
    );
  });

  test('calculates distance to identical location as zero', () => {
    const loc = new GeoLocation(37.7749, -122.4194);

    expect(loc.distanceToInMiles(loc)).toBe(0);
    expect(loc.distanceToInKm(loc)).toBe(0);

    const duplicateLoc = new GeoLocation(37.7749, -122.4194);
    expect(loc.distanceToInMiles(duplicateLoc)).toBe(0);
    expect(loc.distanceToInKm(duplicateLoc)).toBe(0);
  });

  test('calculates distance between poles accurately', () => {
    // North Pole to South Pole is half Earth's circumference (~12,437 miles / ~20,015 km)
    const northPole = new GeoLocation(90, 0);
    const southPole = new GeoLocation(-90, 0);

    const distMiles = northPole.distanceToInMiles(southPole);
    const distKm = northPole.distanceToInKm(southPole);

    expect(Math.round(distMiles)).toBe(12437);
    expect(Math.round(distKm)).toBe(20015);
  });

  test('calculates distance across antimeridian correctly', () => {
    // Points at 0° latitude spanning 179.9° E to -179.9° W (0.2° apart on the equator)
    // 0.2° on equator ~ 13.8 miles / 22.2 km
    const east = new GeoLocation(0, 179.9);
    const west = new GeoLocation(0, -179.9);

    const distMiles = east.distanceToInMiles(west);
    const distKm = east.distanceToInKm(west);

    expect(distMiles).toBeCloseTo(13.8, 0);
    expect(distKm).toBeCloseTo(22.2, 0);
  });

  test('formats string representation with exact 6 decimal places for boundary coordinates', () => {
    const zero = new GeoLocation(0, 0);
    expect(zero.toString()).toBe('0.000000, 0.000000');

    const southWest = new GeoLocation(-90, -180);
    expect(southWest.toString()).toBe('-90.000000, -180.000000');

    const northEast = new GeoLocation(90, 180);
    expect(northEast.toString()).toBe('90.000000, 180.000000');
  });
});
