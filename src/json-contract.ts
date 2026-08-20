export const JSON_CONTRACT_SCHEMA_VERSION = 1;

export type JsonContractOk<T> = {
  ok: true;
  schemaVersion: typeof JSON_CONTRACT_SCHEMA_VERSION;
  data: T;
};

export type JsonContractError = {
  ok: false;
  schemaVersion: typeof JSON_CONTRACT_SCHEMA_VERSION;
  error: {
    message: string;
    code?: string;
  };
};

export function ok<T>(data: T): JsonContractOk<T> {
  return {
    ok: true,
    schemaVersion: JSON_CONTRACT_SCHEMA_VERSION,
    data,
  };
}

export function error(message: string, code?: string): JsonContractError {
  return {
    ok: false,
    schemaVersion: JSON_CONTRACT_SCHEMA_VERSION,
    error: code ? { message, code } : { message },
  };
}
