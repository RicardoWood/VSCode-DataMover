# PeopleSoft DataMover — VS Code Extension v2.0.0

Full IDE support for PeopleSoft DataMover script files (`.dms` and `.dmt`): syntax highlighting, snippets, linting, code completion, a run command, and script templates.

---

## Features

### 1. Syntax Highlighting
Full token-level colouring for commands, SQL, PS_ records, PeopleTools system tables, strings, numbers, comments, and system variables (`#DBTYPE`, `#DBNAME`).

A custom **DataMover Dark** theme is included — enable it via *Preferences: Color Theme → DataMover Dark*.

---

### 2. Linting (Real-time Diagnostics)
Errors and warnings appear inline as you type, in the Problems panel, and as squiggles in the editor.

| Rule | Severity | Description |
|---|---|---|
| Missing semicolon | Error | Statement does not end with `;` |
| Unclosed IF block | Error | `IF` without a matching `END-IF` |
| EXPORT without SET OUTPUT | Warning | No output file has been specified |
| IMPORT/REPLACE without SET INPUT | Warning | No input file has been specified |
| REPLACE_ALL without SET INPUT | Warning | Extra caution — all rows will be deleted |
| Duplicate EXPORT | Warning | Same record exported more than once |

Each rule can be toggled individually in Settings (`datamover.lint.*`).

---

### 3. Code Completion (IntelliSense)
Press `Ctrl+Space` (or just start typing) to get suggestions:

- **Commands** — `EXPORT`, `IMPORT`, `REPLACE_ALL`, `SET`, `IF`, `STOP`, etc., with descriptions
- **SET options** — `INPUT`, `OUTPUT`, `LOG`, `UNICODE_ENABLE`, `IGNORE_DUPS`, etc.
- **PS_ record names** — common HCM, Financials, PeopleTools, and Security records with module labels
- **SQL keywords** — `WHERE`, `AND`, `OR`, `IS NULL`, `BETWEEN`, `SYSDATE`, etc.
- **Database types** — `ORACLE`, `MICROSFT`, `DB2UNIX`, `DB2ODBC` after `#DBTYPE`

---

### 4. Hover Documentation
Hover over any command keyword to see its description, full syntax, and an example.

---

### 5. Code Snippets
Type a prefix and press `Tab` to expand. Key snippets:

| Prefix | Expands to |
|---|---|
| `header` | Full script header with metadata |
| `set-io` | `SET INPUT`, `OUTPUT`, and `LOG` together |
| `export-block` | Complete export pattern |
| `import-block` | Complete import pattern |
| `if` / `if-else` | Conditional blocks |
| `if-oracle` / `if-mssql` / `if-db2` | Platform-specific branches |
| `export-tools` | Export core PeopleTools records |
| `export-security` | Export security records |
| `export-peoplecode` | Export PeopleCode records |
| `rem-section` | Section divider comment |

---

### 6. Run Script
Execute the current `.dms` file directly from VS Code via `psdmtx`.

| Action | How |
|---|---|
| Run with last/default environment | `Ctrl+F5` or the ▶ button in the editor title bar |
| Run with environment picker | `Ctrl+Shift+F5` |
| Right-click a `.dms` file in Explorer | *DataMover: Run Script* |

On first run (or when no environments are configured), you will be prompted for database type, name, operator ID, and password. Add saved environments in Settings for one-click runs.

**Configuration:**
```json
// settings.json
{
  "datamover.psdmtxPath": "C:\\PeopleTools\\bin\\client\\winx86\\psdmtx.exe",
  "datamover.environments": [
    {
      "name":     "HR DEV",
      "dbType":   "ORACLE",
      "dbName":   "HRDEV",
      "userId":   "PS",
      "password": "mypassword"
    }
  ]
}
```

---

### 7. New Script from Template
**Command Palette → *DataMover: New Script from Template***

Six built-in templates, each prompting for script name, author, description, and file paths:

| Template | Purpose |
|---|---|
| Export Script | Export records to a `.dat` file |
| Import Script | Import / replace records from a `.dat` file |
| Migration Script (Export + Import) | Full migration with both phases |
| Security Export | Export operators, roles, and permission lists |
| PeopleTools Objects Export | Export record, field, page, and PeopleCode definitions |
| Conditional (Multi-DB) Script | IF/ELSE blocks for Oracle / SQL Server / DB2 |

---

## Installation

### From a `.vsix` file
1. Extensions panel (`Ctrl+Shift+X`) → `…` → **Install from VSIX…**
2. Select the `.vsix` file.

### Manual (development / no build tools)
1. Copy the `vscode-datamover` folder to your extensions directory:
   - **Windows**: `%USERPROFILE%\.vscode\extensions\`
   - **macOS/Linux**: `~/.vscode/extensions/`
2. Restart VS Code.

### Build a `.vsix` to share
```bash
npm install -g @vscode/vsce
npm install
vsce package
# → peoplesoft-datamover-2.0.0.vsix
```

---

## Settings Reference

| Setting | Default | Description |
|---|---|---|
| `datamover.psdmtxPath` | `""` | Full path to `psdmtx.exe` |
| `datamover.environments` | `[]` | Saved PeopleSoft environments |
| `datamover.lint.missingSetOutput` | `true` | Warn on EXPORT without SET OUTPUT |
| `datamover.lint.missingSetInput` | `true` | Warn on IMPORT without SET INPUT |
| `datamover.lint.missingSemicolon` | `true` | Error on missing semicolons |
| `datamover.lint.unclosedIfBlock` | `true` | Error on unclosed IF blocks |
| `datamover.lint.duplicateExport` | `true` | Warn on duplicate EXPORT |
| `datamover.lint.replaceAllWithoutInput` | `true` | Warn on REPLACE_ALL without SET INPUT |

---

## File Types

| Extension | Description |
|---|---|
| `.dms` | DataMover Script |
| `.dmt` | DataMover Template |

---

## Changelog

### v2.0.0
- Added real-time **linting** with 6 configurable rules
- Added **IntelliSense** code completion for commands, SET options, record names, and SQL
- Added **Run Script** command with environment management (`Ctrl+F5`)
- Added **New Script from Template** with 6 built-in templates
- Added `#DBTYPE`, `#DBNAME` system variable highlighting
- Added code folding for `IF / END-IF` blocks

### v1.1.0
- Added 35 code snippets

### v1.0.0
- Syntax highlighting, hover docs, DataMover Dark theme

---

## License
MIT
