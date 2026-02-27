export interface ViolationResult {
  vehicle_type: 'two_wheeler' | 'four_wheeler';
  violation_type: 'NO_HELMET' | 'NO_SEATBELT' | 'NONE';
  confidence: number;
  plate_number: string;
  fine: number;
  location: string;
  timestamp: string;
  timestamp_ms?: number;
  status: 'CONFIRMED' | 'PENDING' | 'DISCARDED' | 'COMPLIANT';
  bbox: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  violation_zone_bbox: [number, number, number, number] | null;
}

export interface DetectionRecord {
  id: string;
  filename: string;
  url: string;
  results: ViolationResult[];
  timestamp: string;
}

export interface Stats {
  totalScans: number;
  totalViolations: number;
  noHelmet: number;
  noSeatbelt: number;
  twoWViolations: number;
  fourWViolations: number;
  totalFines: number;
}
