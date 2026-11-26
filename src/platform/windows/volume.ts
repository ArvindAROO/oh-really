import { createRequire } from "node:module";
import { parse } from "node:path";

type Koffi = typeof import("koffi");
const require = createRequire(import.meta.url);

let getVolumeInformation: ((...args: unknown[]) => boolean) | undefined;

/**
 * File system name ("NTFS", "ReFS", "exFAT", ...) of the drive holding `path`,
 * via kernel32 GetVolumeInformationW. Needs no admin rights. Undefined for
 * paths it cannot inspect, such as network shares that refuse the query.
 */
export function volumeFileSystem(path: string): string | undefined {
  if (!getVolumeInformation) {
    const koffi: Koffi = require("koffi");
    const kernel32 = koffi.load("kernel32.dll");
    getVolumeInformation = kernel32.func(
      "bool __stdcall GetVolumeInformationW(str16 root, _Out_ uint16_t *name, uint32_t nameLen, " +
        "_Out_ uint32_t *serial, _Out_ uint32_t *maxComponent, _Out_ uint32_t *flags, " +
        "_Out_ uint16_t *fsName, uint32_t fsNameLen)",
    );
  }
  const root = parse(path).root; // "D:\\" or "\\\\server\\share\\"
  const name = new Uint16Array(64);
  if (!getVolumeInformation(root, null, 0, null, null, null, name, name.length)) return undefined;
  const end = name.indexOf(0);
  return String.fromCharCode(...name.subarray(0, end === -1 ? name.length : end)) || undefined;
}
