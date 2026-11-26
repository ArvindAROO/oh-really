import { describe, expect, it } from "vitest";
import { appDirs } from "../../src/run/dirs.js";

describe("appDirs", () => {
  it("uses ~/.config and ~/.local/share on Linux and macOS", () => {
    for (const platform of ["linux", "darwin"] as const) {
      expect(appDirs({ platform, home: "/home/me", env: {} })).toEqual({
        profiles: "/home/me/.config/oh-really/profiles",
        homes: "/home/me/.local/share/oh-really/homes",
      });
    }
  });

  it("honours XDG variables", () => {
    expect(
      appDirs({
        platform: "linux",
        home: "/home/me",
        env: { XDG_CONFIG_HOME: "/c", XDG_DATA_HOME: "/d" },
      }),
    ).toEqual({
      profiles: "/c/oh-really/profiles",
      homes: "/d/oh-really/homes",
    });
  });

  it("uses APPDATA and LOCALAPPDATA on Windows", () => {
    expect(
      appDirs({
        platform: "win32",
        home: "C:\\Users\\me",
        env: {
          APPDATA: "C:\\Users\\me\\AppData\\Roaming",
          LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
        },
      }),
    ).toEqual({
      profiles: "C:\\Users\\me\\AppData\\Roaming\\oh-really\\profiles",
      homes: "C:\\Users\\me\\AppData\\Local\\oh-really\\homes",
    });
  });
});
