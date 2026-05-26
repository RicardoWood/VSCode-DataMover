# PeopleSoft DataMover — VS Code Extension

Syntax highlighting, hover documentation, and a purpose-built dark theme for **PeopleSoft DataMover** script files (`.dms` and `.dmt`).

---

## Features

### Syntax Highlighting

Full token-level highlighting for:

| Token | Colour |
|---|---|
| Commands (`EXPORT`, `IMPORT`, `REPLACE_ALL`, `SET`, …) | Red / bold |
| Control flow (`IF`, `ELSE`, `END-IF`, `STOP`, …) | Red / bold |
| SQL keywords (`WHERE`, `AND`, `SELECT`, `FROM`, …) | Blue |
| Data types (`VARCHAR`, `NUMBER`, `DATE`, …) | Green |
| Built-in functions (`TO_CHAR`, `NVL`, `SUBSTR`, …) | Purple |
| PS_ record names | Green / italic |
| PeopleTools system records (`PSRECDEFN`, `PSOPRDEFN`, …) | Bright green |
| Strings | Light blue |
| Numbers | Blue |
| Comments (`REM`, `/* */`, `//`) | Grey / italic |
| SET options | Orange |
| Export/import parameters | Yellow |

### Hover Documentation

Hover over any DataMover command to see its description, syntax, and an example. Supported commands include:

`EXPORT` · `IMPORT` · `REPLACE_ALL` · `REPLACE_DATA` · `REPLACE_NONE` · `SET` · `DELETE_ROWS` · `ENCRYPT_PASSWORD` · `RENAME` · `SWAP_BASE_LANGUAGE` · `IF` / `END-IF` · `STOP` · `REM`

### DataMover Dark Theme

An optional dark theme tuned for DataMover scripts, based on a GitHub-style dark palette. Enable it from the Command Palette: **Preferences: Color Theme → DataMover Dark**.

---

## File Types

| Extension | Description |
|---|---|
| `.dms` | DataMover Script — the primary script format |
| `.dmt` | DataMover Template — used for parameterised scripts |

---

## Supported Commands

### Data Operations
- `EXPORT` / `IMPORT`
- `REPLACE_ALL` / `REPLACE_DATA` / `REPLACE_NONE`
- `DELETE_ROWS`
- `RENAME`
- `COPY_FROM_DB` / `COPY_INTO_DB`

### Environment / Configuration
- `SET INPUT` / `SET OUTPUT` / `SET LOG`
- `SET UNICODE_ENABLE` / `SET UNICODE_DISABLE`
- `SET NO_RECORD_LOCKING` / `SET RECORD_LOCKING`
- `SET IGNORE_DUPS`
- `SET COMMIT_ENABLED` / `SET COMMIT_DISABLED`
- `SET CREATE_TABLE_ON` / `SET CREATE_TABLE_OFF`
- `ENCRYPT_PASSWORD`
- `SWAP_BASE_LANGUAGE`

### Control Flow
- `IF` / `ELSE` / `END-IF`
- `STOP` / `PAUSE`
- `CALL` / `RETURN`

### Comments
- `REM` / `REMARK` (line comment)
- `/* … */` (block comment)
- `//` (line comment)

---

## Contributing

Issues and pull requests welcome. Please open an issue for any DataMover commands that are missing.

---

Icons by [Icons8](https://icons8.com "Icons8")

---

## License

MIT
