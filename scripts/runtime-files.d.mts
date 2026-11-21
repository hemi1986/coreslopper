export const PAYLOAD_DIR: string;
export const NOT_SHIPPED: string[];
export const SHIPPED: string[];
export function runtimePath(path: string): string | null | undefined;
export function planRuntime(trackedFiles: string[]): Map<string, string>;
