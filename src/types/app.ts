// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Wartungsarten {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    bezeichnung?: string;
    beschreibung?: string;
    intervall_tage?: number;
  };
}

export interface Wartungsprotokolle {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    titel?: string;
    wartungsart?: string; // applookup -> URL zu 'Wartungsarten' Record
    datum_wartung?: string; // Format: YYYY-MM-DD oder ISO String
    naechste_wartung?: string; // Format: YYYY-MM-DD oder ISO String
    kosten?: number;
    techniker?: string;
    status?: LookupValue;
    notizen?: string;
  };
}

export const APP_IDS = {
  WARTUNGSARTEN: '6a47826ee31558df03851d7e',
  WARTUNGSPROTOKOLLE: '6a478275fd40d1bdf4314de4',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'wartungsprotokolle': {
    status: [{ key: "offen", label: "Offen" }, { key: "erledigt", label: "Erledigt" }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'wartungsarten': {
    'bezeichnung': 'string/text',
    'beschreibung': 'string/textarea',
    'intervall_tage': 'number',
  },
  'wartungsprotokolle': {
    'titel': 'string/text',
    'wartungsart': 'applookup/select',
    'datum_wartung': 'date/date',
    'naechste_wartung': 'date/date',
    'kosten': 'number',
    'techniker': 'string/text',
    'status': 'lookup/radio',
    'notizen': 'string/textarea',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateWartungsarten = StripLookup<Wartungsarten['fields']>;
export type CreateWartungsprotokolle = StripLookup<Wartungsprotokolle['fields']>;