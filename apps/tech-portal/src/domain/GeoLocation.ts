/**
 * Value Object representing geographical coordinates (latitude and longitude).
 * Enforces domain invariants for valid Earth coordinates (-90° to +90° latitude, -180° to +180° longitude).
 */
export class GeoLocation {
  private static readonly EARTH_RADIUS_MILES = 3958.8;
  private static readonly EARTH_RADIUS_KM = 6371.0;

  private readonly latitude: number;
  private readonly longitude: number;

  constructor(latitude: number, longitude: number) {
    if (typeof latitude !== 'number' || isNaN(latitude) || !isFinite(latitude)) {
      throw new Error(`Invalid latitude value: '${latitude}'. Must be a valid number.`);
    }

    if (latitude < -90 || latitude > 90) {
      throw new Error(`Latitude '${latitude}' is out of bounds. Must be between -90 and 90 degrees.`);
    }

    if (typeof longitude !== 'number' || isNaN(longitude) || !isFinite(longitude)) {
      throw new Error(`Invalid longitude value: '${longitude}'. Must be a valid number.`);
    }

    if (longitude < -180 || longitude > 180) {
      throw new Error(`Longitude '${longitude}' is out of bounds. Must be between -180 and 180 degrees.`);
    }

    this.latitude = latitude;
    this.longitude = longitude;
  }

  public static isValid(latitude: number, longitude: number): boolean {
    return (
      typeof latitude === 'number' &&
      !isNaN(latitude) &&
      isFinite(latitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      typeof longitude === 'number' &&
      !isNaN(longitude) &&
      isFinite(longitude) &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  public static fromTuple(tuple: [number, number]): GeoLocation {
    if (!Array.isArray(tuple) || tuple.length !== 2) {
      throw new Error('Invalid coordinate tuple. Must be an array of two numbers [latitude, longitude].');
    }
    return new GeoLocation(tuple[0], tuple[1]);
  }

  public getLatitude(): number {
    return this.latitude;
  }

  public getLongitude(): number {
    return this.longitude;
  }

  public toTuple(): [number, number] {
    return [this.latitude, this.longitude];
  }

  public equals(other: GeoLocation): boolean {
    if (!other) return false;
    return this.latitude === other.getLatitude() && this.longitude === other.getLongitude();
  }

  public distanceToInMiles(other: GeoLocation): number {
    return this.calculateHaversineDistance(other, GeoLocation.EARTH_RADIUS_MILES);
  }

  public distanceToInKm(other: GeoLocation): number {
    return this.calculateHaversineDistance(other, GeoLocation.EARTH_RADIUS_KM);
  }

  private calculateHaversineDistance(other: GeoLocation, earthRadius: number): number {
    if (!other) {
      throw new Error('Target location is required to calculate distance.');
    }

    const dLat = this.toRadians(other.getLatitude() - this.latitude);
    const dLng = this.toRadians(other.getLongitude() - this.longitude);

    const lat1Rad = this.toRadians(this.latitude);
    const lat2Rad = this.toRadians(other.getLatitude());

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  public toString(): string {
    return `${this.latitude.toFixed(6)}, ${this.longitude.toFixed(6)}`;
  }
}
