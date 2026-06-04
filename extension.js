'use strict';

// ─── PeopleSoft DataMover VS Code Extension v2.0.0 ───────────────────────────
//
//  Features
//  1. Syntax highlighting  (grammar / theme — declarative, no JS needed)
//  2. Hover documentation  (registerHoverProvider)
//  3. Code snippets        (declarative in snippets/datamover.json)
//  4. Linting              (registerDiagnosticsProvider — validates on save/open)
//  5. Code completion      (registerCompletionItemProvider)
//  6. Run script command   (executes psdmtx in the integrated terminal)
//  7. New script template  (prompts for template on File > New)
// ─────────────────────────────────────────────────────────────────────────────

const vscode = require('vscode');
const path   = require('path');
const fs     = require('fs');

// ─── Activation ──────────────────────────────────────────────────────────────

/** @param {vscode.ExtensionContext} context */
function activate(context) {

  // 1. Diagnostics collection (linter)
  const diagnostics = vscode.languages.createDiagnosticCollection('datamover');
  context.subscriptions.push(diagnostics);

  // Run linter on open / save
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc  => lintDocument(doc, diagnostics)),
    vscode.workspace.onDidSaveTextDocument(doc  => lintDocument(doc, diagnostics)),
    vscode.workspace.onDidChangeTextDocument(e  => lintDocument(e.document, diagnostics)),
    vscode.workspace.onDidCloseTextDocument(doc => diagnostics.delete(doc.uri))
  );

  // Lint any already-open DataMover files
  vscode.workspace.textDocuments.forEach(doc => lintDocument(doc, diagnostics));

  // 2. Hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('datamover', { provideHover })
  );

  // 3. Completion provider
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      'datamover',
      { provideCompletionItems },
      ' ', '\t', '('   // trigger characters
    )
  );

  // 4. Run script commands
  context.subscriptions.push(
    vscode.commands.registerCommand('datamover.runScript',        () => runScript(context, false)),
    vscode.commands.registerCommand('datamover.runScriptWithEnv', () => runScript(context, true))
  );

  // 5. New script from template
  context.subscriptions.push(
    vscode.commands.registerCommand('datamover.newScript', () => newScriptFromTemplate(context))
  );

  console.log('PeopleSoft DataMover extension v2.0.0 activated.');
}

function deactivate() {}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 1 — LINTING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Lint a document and push diagnostics.
 * @param {vscode.TextDocument} doc
 * @param {vscode.DiagnosticCollection} collection
 */
function lintDocument(doc, collection) {
  if (doc.languageId !== 'datamover') return;

  const cfg  = vscode.workspace.getConfiguration('datamover.lint');
  const diag = [];
  const text = doc.getText();
  const lines = text.split('\n');

  let setOutputSeen  = false;
  let setInputSeen   = false;
  let ifDepth        = 0;
  let ifOpenLines    = [];  // stack of line numbers where IF was opened
  const exportedRecords = new Map(); // recordName → first line number

  // Patterns
  const RE_SET_OUTPUT  = /^\s*SET\s+OUTPUT\b/i;
  const RE_SET_INPUT   = /^\s*SET\s+INPUT\b/i;
  const RE_EXPORT      = /^\s*EXPORT\s+(\w+)/i;
  const RE_IMPORT      = /^\s*(?:IMPORT|REPLACE_ALL|REPLACE_DATA|REPLACE_NONE)\b/i;
  const RE_REPLACE_ALL = /^\s*REPLACE_ALL\b/i;
  const RE_IF          = /^\s*IF\b/i;
  const RE_ENDIF       = /^\s*END-IF\b/i;
  const RE_COMMENT     = /^\s*(REM\b|REMARK\b|\/\/|\/\*|\*)/i;
  const RE_BLANK       = /^\s*$/;
  // Lines that are valid without a semicolon
  const RE_NO_SEMI_NEEDED = /^\s*(END-IF|ELSE|\/\*|\*|REM\b|REMARK\b|\/\/)/i;
  // A "statement" line — should end with semicolon (ignoring trailing whitespace/comments)
  const RE_NEEDS_SEMI  = /^\s*(EXPORT|IMPORT|REPLACE_ALL|REPLACE_DATA|REPLACE_NONE|DELETE_ROWS|SET|STOP|PAUSE|ENCRYPT_PASSWORD|RENAME|SWAP_BASE_LANGUAGE|CALL|RETURN|RUN|RUNSCRIPT|EXECUTE)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const raw  = lines[i];
    const line = raw.trimEnd();

    if (RE_BLANK.test(line) || RE_COMMENT.test(line)) continue;

    // Track SET OUTPUT / INPUT
    if (RE_SET_OUTPUT.test(line))  setOutputSeen = true;
    if (RE_SET_INPUT.test(line))   setInputSeen  = true;

    // IF / END-IF depth tracking
    if (RE_IF.test(line)) {
      ifDepth++;
      ifOpenLines.push(i);
    }
    if (RE_ENDIF.test(line)) {
      ifDepth = Math.max(0, ifDepth - 1);
      ifOpenLines.pop();
    }

    // EXPORT without SET OUTPUT
    const exportMatch = line.match(RE_EXPORT);
    if (exportMatch) {
      if (cfg.get('missingSetOutput') && !setOutputSeen) {
        diag.push(makeDiag(
          doc, i, line,
          `EXPORT used before SET OUTPUT — no output file has been specified.`,
          vscode.DiagnosticSeverity.Warning
        ));
      }

      // Duplicate export check
      if (cfg.get('duplicateExport')) {
        const recName = exportMatch[1].toUpperCase();
        if (exportedRecords.has(recName)) {
          diag.push(makeDiag(
            doc, i, line,
            `Duplicate EXPORT: '${recName}' was already exported on line ${exportedRecords.get(recName) + 1}.`,
            vscode.DiagnosticSeverity.Warning
          ));
        } else {
          exportedRecords.set(recName, i);
        }
      }
    }

    // IMPORT / REPLACE without SET INPUT
    if (cfg.get('missingSetInput') && RE_IMPORT.test(line) && !setInputSeen) {
      diag.push(makeDiag(
        doc, i, line,
        `Import statement used before SET INPUT — no input file has been specified.`,
        vscode.DiagnosticSeverity.Warning
      ));
    }

    // REPLACE_ALL without SET INPUT (extra-specific warning)
    if (cfg.get('replaceAllWithoutInput') && RE_REPLACE_ALL.test(line) && !setInputSeen) {
      diag.push(makeDiag(
        doc, i, line,
        `REPLACE_ALL will delete all existing rows — but no SET INPUT file has been set. Is this intentional?`,
        vscode.DiagnosticSeverity.Warning
      ));
    }

    // Missing semicolon
    if (cfg.get('missingSemicolon') && RE_NEEDS_SEMI.test(line) && !RE_NO_SEMI_NEEDED.test(line)) {
      // Strip inline comments to check for semicolon
      const stripped = line.replace(/--.*$/, '').replace(/\/\/.*$/, '').trimEnd();
      if (!stripped.endsWith(';')) {
        diag.push(makeDiag(
          doc, i, line,
          `Missing semicolon at end of statement.`,
          vscode.DiagnosticSeverity.Error
        ));
      }
    }
  }

  // Unclosed IF blocks
  if (cfg.get('unclosedIfBlock') && ifDepth > 0) {
    for (const lineNo of ifOpenLines) {
      diag.push(makeDiag(
        doc, lineNo, lines[lineNo],
        `IF block is never closed with END-IF.`,
        vscode.DiagnosticSeverity.Error
      ));
    }
  }

  collection.set(doc.uri, diag);
}

/**
 * Build a Diagnostic covering the non-whitespace content of a line.
 */
function makeDiag(doc, lineIndex, lineText, message, severity) {
  const start  = lineText.search(/\S/);
  const end    = lineText.trimEnd().length;
  const range  = new vscode.Range(lineIndex, start < 0 ? 0 : start, lineIndex, end);
  const d      = new vscode.Diagnostic(range, message, severity);
  d.source     = 'DataMover';
  return d;
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 2 — HOVER DOCUMENTATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @param {vscode.TextDocument} document
 * @param {vscode.Position} position
 */
function provideHover(document, position) {
  const range = document.getWordRangeAtPosition(position, /[A-Z_][A-Z0-9_-]*/i);
  if (!range) return;

  const word = document.getText(range).toUpperCase();
  const info = COMMAND_DOCS[word];
  if (!info) return;

  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.appendMarkdown(`### \`${word}\`\n\n${info.description}`);
  if (info.syntax)  md.appendMarkdown(`\n\n**Syntax**\n\`\`\`\n${info.syntax}\n\`\`\``);
  if (info.example) md.appendMarkdown(`\n\n**Example**\n\`\`\`\n${info.example}\n\`\`\``);

  return new vscode.Hover(md, range);
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 3 — CODE COMPLETION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @param {vscode.TextDocument} document
 * @param {vscode.Position} position
 * @returns {vscode.CompletionItem[]}
 */
function provideCompletionItems(document, position) {
  const linePrefix = document.lineAt(position).text.substring(0, position.character).toUpperCase().trim();
  const items = [];

  // ── Top-level commands ──────────────────────────────────────────────────
  for (const [kw, doc] of Object.entries(COMMAND_DOCS)) {
    const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
    item.detail      = 'DataMover command';
    item.documentation = new vscode.MarkdownString(doc.description);
    if (doc.insertText) item.insertText = new vscode.SnippetString(doc.insertText);
    items.push(item);
  }

  // ── SET sub-options ─────────────────────────────────────────────────────
  if (linePrefix.startsWith('SET')) {
    for (const opt of SET_OPTIONS) {
      const item = new vscode.CompletionItem(opt.label, vscode.CompletionItemKind.Property);
      item.detail        = 'SET option';
      item.documentation = new vscode.MarkdownString(opt.description);
      if (opt.insertText) item.insertText = new vscode.SnippetString(opt.insertText);
      items.push(item);
    }
  }

  // ── SQL keywords (after WHERE / AND / OR) ───────────────────────────────
  if (/\bWHERE\b|\bAND\b|\bOR\b/.test(linePrefix)) {
    for (const kw of SQL_KEYWORDS) {
      const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
      item.detail = 'SQL keyword';
      items.push(item);
    }
  }

  // ── Common PS_ record names ─────────────────────────────────────────────
  if (/\b(EXPORT|IMPORT|REPLACE_ALL|REPLACE_DATA|REPLACE_NONE|DELETE_ROWS)\s+\w*$/.test(linePrefix)) {
    for (const rec of PS_RECORD_NAMES) {
      const item = new vscode.CompletionItem(rec.name, vscode.CompletionItemKind.Class);
      item.detail        = rec.module;
      item.documentation = new vscode.MarkdownString(rec.description);
      items.push(item);
    }
  }

  // ── Database types after IF #DBTYPE ────────────────────────────────────
  if (linePrefix.includes('#DBTYPE')) {
    for (const db of ['ORACLE', 'MICROSFT', 'DB2UNIX', 'DB2ODBC']) {
      const item = new vscode.CompletionItem(`"${db}"`, vscode.CompletionItemKind.EnumMember);
      item.detail = 'Database platform';
      items.push(item);
    }
  }

  return items;
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 4 — RUN SCRIPT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Run the current .dms file via psdmtx in the integrated terminal.
 * @param {vscode.ExtensionContext} context
 * @param {boolean} pickEnv  — true = prompt for environment selection
 */
async function runScript(context, pickEnv) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'datamover') {
    vscode.window.showErrorMessage('DataMover: No active DataMover script to run.');
    return;
  }

  // Save first
  if (editor.document.isDirty) {
    const save = await vscode.window.showWarningMessage(
      'The file has unsaved changes. Save before running?',
      'Save & Run', 'Cancel'
    );
    if (save !== 'Save & Run') return;
    await editor.document.save();
  }

  const scriptPath = editor.document.uri.fsPath;
  const cfg = vscode.workspace.getConfiguration('datamover');
  const psdmtxPath = cfg.get('psdmtxPath', '').trim();
  const environments = cfg.get('environments', []);

  let env = null;

  if (pickEnv || environments.length > 1) {
    if (environments.length === 0) {
      // No saved envs — ask for connection details ad-hoc
      env = await promptForEnvironment();
      if (!env) return;
    } else {
      const choice = await vscode.window.showQuickPick(
        environments.map(e => ({
          label:       e.name,
          description: `${e.dbType} — ${e.dbName}`,
          env:         e
        })),
        { placeHolder: 'Select a PeopleSoft environment to run against' }
      );
      if (!choice) return;
      env = choice.env;
    }
  } else if (environments.length === 1) {
    env = environments[0];
  } else {
    env = await promptForEnvironment();
    if (!env) return;
  }

  // Build psdmtx command
  const exe = psdmtxPath || 'psdmtx';

  // Quote path if it contains spaces
  const quotedScript = scriptPath.includes(' ') ? `"${scriptPath}"` : scriptPath;
  const quotedExe    = exe.includes(' ')         ? `"${exe}"`        : exe;

  const cmd = [
    quotedExe,
    `-CT ${env.dbType}`,
    `-CD ${env.dbName}`,
    `-CO ${env.userId}`,
    `-CP ${env.password}`,
    `-FP ${quotedScript}`
  ].join(' ');

  // Re-use or create a dedicated terminal
  let terminal = vscode.window.terminals.find(t => t.name === 'DataMover');
  if (!terminal) {
    terminal = vscode.window.createTerminal({ name: 'DataMover' });
  }
  terminal.show(true);
  terminal.sendText(cmd);

  vscode.window.setStatusBarMessage(`$(play) Running ${path.basename(scriptPath)} on ${env.name || env.dbName}…`, 5000);
}

/**
 * Prompt the user for connection details when no saved environments exist.
 */
async function promptForEnvironment() {
  const dbType = await vscode.window.showQuickPick(
    ['ORACLE', 'MICROSFT', 'DB2UNIX', 'DB2ODBC'],
    { placeHolder: 'Database type' }
  );
  if (!dbType) return null;

  const dbName = await vscode.window.showInputBox({ prompt: 'Database / server name', placeHolder: 'e.g. HRPRD' });
  if (!dbName) return null;

  const userId = await vscode.window.showInputBox({ prompt: 'PeopleSoft Operator ID', placeHolder: 'e.g. PS' });
  if (!userId) return null;

  const password = await vscode.window.showInputBox({ prompt: 'Operator Password', password: true });
  if (!password) return null;

  return { name: `${dbType} / ${dbName}`, dbType, dbName, userId, password };
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 5 — NEW SCRIPT FROM TEMPLATE
// ═════════════════════════════════════════════════════════════════════════════

const TEMPLATES = {
  'Export Script': {
    description: 'Export one or more records to a .dat file',
    build: (vars) => `REM ============================================================
REM  Script      : ${vars.scriptName}.dms
REM  Environment : ${vars.environment}
REM  Author      : ${vars.author}
REM  Date        : ${vars.date}
REM  Description : ${vars.description}
REM ============================================================

SET OUTPUT ${vars.outputPath}${vars.scriptName}.dat;
SET LOG    ${vars.outputPath}${vars.scriptName}.log;

REM --- Exports ---
EXPORT PS_RECORD_NAME;

STOP;
`
  },

  'Import Script': {
    description: 'Import / replace records from a .dat file',
    build: (vars) => `REM ============================================================
REM  Script      : ${vars.scriptName}.dms
REM  Environment : ${vars.environment}
REM  Author      : ${vars.author}
REM  Date        : ${vars.date}
REM  Description : ${vars.description}
REM ============================================================

SET INPUT ${vars.inputPath}${vars.scriptName}.dat;
SET LOG   ${vars.inputPath}${vars.scriptName}_import.log;

REM --- Imports ---
REPLACE_ALL PS_RECORD_NAME;

STOP;
`
  },

  'Migration Script (Export + Import)': {
    description: 'Full migration: export phase then import phase',
    build: (vars) => `REM ============================================================
REM  Migration   : ${vars.scriptName}
REM  From        : ${vars.sourceEnv}  ->  To: ${vars.targetEnv}
REM  Author      : ${vars.author}
REM  Date        : ${vars.date}
REM  Description : ${vars.description}
REM ============================================================

/* ── PHASE 1: Run on SOURCE environment ─────────────────────── */
SET OUTPUT ${vars.outputPath}${vars.scriptName}_export.dat;
SET LOG    ${vars.outputPath}${vars.scriptName}_export.log;

EXPORT PS_RECORD_ONE;
EXPORT PS_RECORD_TWO;

STOP;

/* ── PHASE 2: Run on TARGET environment ─────────────────────── */
REM SET INPUT ${vars.outputPath}${vars.scriptName}_export.dat;
REM SET LOG   ${vars.outputPath}${vars.scriptName}_import.log;
REM REPLACE_ALL PS_RECORD_ONE;
REM REPLACE_ALL PS_RECORD_TWO;
REM STOP;
`
  },

  'Security Export': {
    description: 'Export all PeopleSoft security records',
    build: (vars) => `REM ============================================================
REM  Script      : ${vars.scriptName}.dms
REM  Environment : ${vars.environment}
REM  Author      : ${vars.author}
REM  Date        : ${vars.date}
REM  Description : Security records export
REM ============================================================

SET OUTPUT ${vars.outputPath}${vars.scriptName}.dat;
SET LOG    ${vars.outputPath}${vars.scriptName}.log;

REM --- Operator / Role definitions ---
EXPORT PSOPRDEFN;
EXPORT PSROLEDEFN;
EXPORT PSROLEUSER;

REM --- Permission lists ---
EXPORT PSAUTHITEM;
EXPORT PSPERMLIST;
EXPORT PSCLASSDEFN;

STOP;
`
  },

  'PeopleTools Objects Export': {
    description: 'Export core PeopleTools definition records',
    build: (vars) => `REM ============================================================
REM  Script      : ${vars.scriptName}.dms
REM  Environment : ${vars.environment}
REM  Author      : ${vars.author}
REM  Date        : ${vars.date}
REM  Description : PeopleTools object definitions export
REM ============================================================

SET OUTPUT ${vars.outputPath}${vars.scriptName}.dat;
SET LOG    ${vars.outputPath}${vars.scriptName}.log;

REM --- Record / Field definitions ---
EXPORT PSRECDEFN;
EXPORT PSFIELDDEFN;
EXPORT PSRECFIELD;
EXPORT PSDBFIELD;
EXPORT PSDBRECORD;

REM --- Menu / Panel definitions ---
EXPORT PSMENUDEFN;
EXPORT PSMENUITEM;
EXPORT PSPNLDEFN;
EXPORT PSPNLFIELD;
EXPORT PSPNLGRPDEFN;

REM --- PeopleCode ---
EXPORT PSPCMPROG;
EXPORT PSPCMTXT;

STOP;
`
  },

  'Conditional (Multi-DB) Script': {
    description: 'Template with IF blocks for Oracle / SQL Server / DB2',
    build: (vars) => `REM ============================================================
REM  Script      : ${vars.scriptName}.dms
REM  Environment : ${vars.environment}
REM  Author      : ${vars.author}
REM  Date        : ${vars.date}
REM  Description : ${vars.description}
REM ============================================================

SET OUTPUT ${vars.outputPath}${vars.scriptName}.dat;
SET LOG    ${vars.outputPath}${vars.scriptName}.log;

REM --- Database-specific logic ---
IF #DBTYPE = "ORACLE"
   EXPORT PS_ORA_SPECIFIC;
ELSE
   IF #DBTYPE = "MICROSFT"
      EXPORT PS_MSSQL_SPECIFIC;
   ELSE
      EXPORT PS_DB2_SPECIFIC;
   END-IF
END-IF

REM --- Common records (all platforms) ---
EXPORT PS_INSTALLATION;

STOP;
`
  }
};

/**
 * Walk the user through selecting a template and filling in variables,
 * then open the result as a new untitled document.
 */
async function newScriptFromTemplate() {
  // 1. Pick template
  const templateChoice = await vscode.window.showQuickPick(
    Object.entries(TEMPLATES).map(([label, t]) => ({ label, description: t.description })),
    { placeHolder: 'Select a DataMover script template' }
  );
  if (!templateChoice) return;

  const template = TEMPLATES[templateChoice.label];

  // 2. Gather common variables
  const today = new Date();
  const date  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const scriptName = await vscode.window.showInputBox({
    prompt:      'Script name (without extension)',
    placeHolder: 'e.g. hr_export_job',
    validateInput: v => (v && v.trim() ? null : 'Script name is required')
  });
  if (!scriptName) return;

  const author = await vscode.window.showInputBox({
    prompt:      'Author name',
    placeHolder: 'e.g. Jane Smith',
    value:       ''
  });
  if (author === undefined) return;

  const description = await vscode.window.showInputBox({
    prompt:      'Short description',
    placeHolder: 'e.g. Export HR job records for migration'
  });
  if (description === undefined) return;

  // Migration template needs source + target env names
  let environment = '', sourceEnv = '', targetEnv = '', outputPath = '', inputPath = '';

  if (templateChoice.label === 'Migration Script (Export + Import)') {
    sourceEnv = await vscode.window.showInputBox({ prompt: 'Source environment name', placeHolder: 'e.g. HRDEV' }) || '';
    if (sourceEnv === undefined) return;
    targetEnv = await vscode.window.showInputBox({ prompt: 'Target environment name', placeHolder: 'e.g. HRUAT' }) || '';
    if (targetEnv === undefined) return;
  } else {
    environment = await vscode.window.showInputBox({ prompt: 'Environment name', placeHolder: 'e.g. HRPRD' }) || '';
  }

  outputPath = await vscode.window.showInputBox({
    prompt:      'Output / input file path (directory with trailing slash)',
    placeHolder: process.platform === 'win32' ? 'C:\\temp\\' : '/tmp/',
    value:       process.platform === 'win32' ? 'C:\\temp\\' : '/tmp/'
  }) || '';
  inputPath = outputPath;

  // 3. Build content from template
  const content = template.build({
    scriptName, author, description, date,
    environment, sourceEnv, targetEnv,
    outputPath, inputPath
  });

  // 4. Open as new document
  const doc = await vscode.workspace.openTextDocument({
    language: 'datamover',
    content
  });
  await vscode.window.showTextDocument(doc);

  vscode.window.showInformationMessage(`DataMover: Script created from template "${templateChoice.label}". Save it as ${scriptName}.dms`);
}

// ═════════════════════════════════════════════════════════════════════════════
// DATA — Command docs, SET options, record names, SQL keywords
// ═════════════════════════════════════════════════════════════════════════════

const COMMAND_DOCS = {
  EXPORT: {
    description: 'Exports rows from a record in the database to the output file specified by `SET OUTPUT`.',
    syntax:  'EXPORT record_name;\nEXPORT record_name WHERE condition;',
    example: 'EXPORT PS_JOB;\nEXPORT PS_JOB WHERE COMPANY = \'GBI\';',
    insertText: 'EXPORT ${1:PS_RECORD_NAME};'
  },
  IMPORT: {
    description: 'Imports rows from the input file into the database. Rows that already exist are skipped unless a `REPLACE_*` mode is set.',
    syntax:  'IMPORT record_name;',
    example: 'IMPORT PS_JOB;',
    insertText: 'IMPORT ${1:PS_RECORD_NAME};'
  },
  REPLACE_ALL: {
    description: 'Deletes **all** existing rows for the record first, then imports from the input file. Use with caution in production.',
    syntax:  'REPLACE_ALL record_name;',
    example: 'REPLACE_ALL PS_INSTALLATION;',
    insertText: 'REPLACE_ALL ${1:PS_RECORD_NAME};'
  },
  REPLACE_DATA: {
    description: 'Replaces rows that match keys in the input file; rows not in the file are left untouched.',
    syntax:  'REPLACE_DATA record_name;',
    example: 'REPLACE_DATA PS_DEPT_TBL;',
    insertText: 'REPLACE_DATA ${1:PS_RECORD_NAME};'
  },
  REPLACE_NONE: {
    description: 'Insert-only import — skips any row whose key already exists in the database.',
    syntax:  'REPLACE_NONE record_name;',
    example: 'REPLACE_NONE PS_JOBCODE_TBL;',
    insertText: 'REPLACE_NONE ${1:PS_RECORD_NAME};'
  },
  SET: {
    description: 'Sets a DataMover environment option. Common options: `INPUT`, `OUTPUT`, `LOG`, `UNICODE_ENABLE`, `IGNORE_DUPS`, `COMMIT_ENABLED`, `CREATE_TABLE_ON`.',
    syntax:  'SET option_name [value];',
    example: 'SET LOG c:\\temp\\script.log;\nSET OUTPUT c:\\temp\\export.dat;',
    insertText: 'SET ${1|INPUT,OUTPUT,LOG,UNICODE_ENABLE,UNICODE_DISABLE,IGNORE_DUPS,NO_RECORD_LOCKING,COMMIT_ENABLED,COMMIT_DISABLED,CREATE_TABLE_ON,CREATE_TABLE_OFF|}'
  },
  DELETE_ROWS: {
    description: 'Deletes rows from the specified record. Without a WHERE clause, all rows are deleted.',
    syntax:  'DELETE_ROWS record_name;\nDELETE_ROWS record_name WHERE condition;',
    example: 'DELETE_ROWS PS_TEMP_WORK;\nDELETE_ROWS PS_JOB WHERE EFFDT < \'2020-01-01\';',
    insertText: 'DELETE_ROWS ${1:PS_RECORD_NAME};'
  },
  ENCRYPT_PASSWORD: {
    description: 'Hashes a plain-text password and writes the encrypted value to the access profile.',
    syntax:  'ENCRYPT_PASSWORD plain_text_password;',
    example: 'ENCRYPT_PASSWORD mypassword;',
    insertText: 'ENCRYPT_PASSWORD ${1:plain_text_password};'
  },
  RENAME: {
    description: 'Renames a record in the database.',
    syntax:  'RENAME RECORD old_name AS new_name;',
    example: 'RENAME RECORD PS_OLD_TABLE AS PS_NEW_TABLE;',
    insertText: 'RENAME RECORD ${1:OLD_NAME} AS ${2:NEW_NAME};'
  },
  SWAP_BASE_LANGUAGE: {
    description: 'Swaps the database base language with the specified language code.',
    syntax:  'SWAP_BASE_LANGUAGE language_cd;',
    example: 'SWAP_BASE_LANGUAGE FRA;',
    insertText: 'SWAP_BASE_LANGUAGE ${1:ENG};'
  },
  IF: {
    description: 'Begins a conditional block. Supports `IF / ELSE / END-IF`.\n\nSystem variables: `#DBTYPE`, `#DBNAME`, `#TOOLSREL`.',
    syntax:  'IF condition\n   statements;\n[ELSE\n   statements;]\nEND-IF',
    example: 'IF #DBTYPE = "ORACLE"\n   EXPORT PS_ORA_TBL;\nEND-IF',
    insertText: 'IF ${1:#DBTYPE} = "${2:ORACLE}"\n\t${3:EXPORT PS_RECORD_NAME;}\nEND-IF'
  },
  'END-IF': {
    description: 'Closes an `IF` conditional block.',
    syntax: 'END-IF'
  },
  ELSE: {
    description: 'Optional alternative branch within an `IF / END-IF` block.',
    syntax: 'IF condition\n   ...\nELSE\n   ...\nEND-IF'
  },
  STOP: {
    description: 'Stops script execution immediately.',
    syntax:  'STOP;',
    example: 'IF #RESULT = 0\n   STOP;\nEND-IF',
    insertText: 'STOP;'
  },
  REM: {
    description: 'Comment line — the rest of the line is ignored by DataMover.',
    syntax:  'REM comment text;',
    example: 'REM Export all HR job records;',
    insertText: 'REM ${1:comment};'
  }
};

const SET_OPTIONS = [
  { label: 'INPUT',            description: 'Path to the input data file',                  insertText: 'INPUT ${1:C:\\\\temp\\\\data.dat};' },
  { label: 'OUTPUT',           description: 'Path to the output data file',                 insertText: 'OUTPUT ${1:C:\\\\temp\\\\data.dat};' },
  { label: 'LOG',              description: 'Path to the log file',                         insertText: 'LOG ${1:C:\\\\temp\\\\script.log};' },
  { label: 'UNICODE_ENABLE',   description: 'Enable Unicode mode',                          insertText: 'UNICODE_ENABLE;' },
  { label: 'UNICODE_DISABLE',  description: 'Disable Unicode mode',                         insertText: 'UNICODE_DISABLE;' },
  { label: 'IGNORE_DUPS',      description: 'Ignore duplicate key errors during import',    insertText: 'IGNORE_DUPS;' },
  { label: 'NO_RECORD_LOCKING',description: 'Disable record locking for better performance',insertText: 'NO_RECORD_LOCKING;' },
  { label: 'COMMIT_ENABLED',   description: 'Enable commit during import',                  insertText: 'COMMIT_ENABLED;' },
  { label: 'COMMIT_DISABLED',  description: 'Disable commit during import',                 insertText: 'COMMIT_DISABLED;' },
  { label: 'CREATE_TABLE_ON',  description: 'Auto-create tables if they do not exist',      insertText: 'CREATE_TABLE_ON;' },
  { label: 'CREATE_TABLE_OFF', description: 'Do not auto-create tables',                    insertText: 'CREATE_TABLE_OFF;' }
];

const SQL_KEYWORDS = [
  'AND','OR','NOT','IN','LIKE','BETWEEN','IS','NULL','IS NOT NULL',
  'ORDER BY','GROUP BY','HAVING','DISTINCT','ASC','DESC',
  'SYSDATE','CURRENT_DATE','ROWNUM'
];

const PS_RECORD_NAMES = [
  // PeopleTools
  { name: 'PSRECDEFN',      module: 'PeopleTools',  description: 'Record definitions' },
  { name: 'PSFIELDDEFN',    module: 'PeopleTools',  description: 'Field definitions' },
  { name: 'PSRECFIELD',     module: 'PeopleTools',  description: 'Record field mappings' },
  { name: 'PSDBFIELD',      module: 'PeopleTools',  description: 'Database field properties' },
  { name: 'PSDBRECORD',     module: 'PeopleTools',  description: 'Database record properties' },
  { name: 'PSMENUDEFN',     module: 'PeopleTools',  description: 'Menu definitions' },
  { name: 'PSMENUITEM',     module: 'PeopleTools',  description: 'Menu items' },
  { name: 'PSPNLDEFN',      module: 'PeopleTools',  description: 'Page (panel) definitions' },
  { name: 'PSPNLFIELD',     module: 'PeopleTools',  description: 'Page field properties' },
  { name: 'PSPNLGRPDEFN',   module: 'PeopleTools',  description: 'Component (panel group) definitions' },
  { name: 'PSPCMPROG',      module: 'PeopleTools',  description: 'PeopleCode program headers' },
  { name: 'PSPCMTXT',       module: 'PeopleTools',  description: 'PeopleCode program text' },
  { name: 'PSAPPCLASSDEFN', module: 'PeopleTools',  description: 'Application class definitions' },
  // Security
  { name: 'PSOPRDEFN',      module: 'Security',     description: 'Operator (user) definitions' },
  { name: 'PSROLEDEFN',     module: 'Security',     description: 'Role definitions' },
  { name: 'PSROLEUSER',     module: 'Security',     description: 'Role-to-user assignments' },
  { name: 'PSAUTHITEM',     module: 'Security',     description: 'Permission list items' },
  { name: 'PSPERMLIST',     module: 'Security',     description: 'Permission list definitions' },
  { name: 'PSCLASSDEFN',    module: 'Security',     description: 'Permission list class definitions' },
  // HCM
  { name: 'PS_INSTALLATION',module: 'HCM Core',     description: 'System installation record' },
  { name: 'PS_JOB',         module: 'HCM Core',     description: 'Employee job records' },
  { name: 'PS_PERSONAL_DATA',module:'HCM Core',     description: 'Employee personal data' },
  { name: 'PS_DEPT_TBL',    module: 'HCM Core',     description: 'Department table' },
  { name: 'PS_JOBCODE_TBL', module: 'HCM Core',     description: 'Job code table' },
  { name: 'PS_LOCATION_TBL',module: 'HCM Core',     description: 'Location table' },
  { name: 'PS_COMPANY_TBL', module: 'HCM Core',     description: 'Company table' },
  { name: 'PS_BUS_UNIT_HR_VW',module:'HCM Core',    description: 'Business unit HR view' },
  // Financials
  { name: 'PS_BUS_UNIT_TBL_GL',module:'Financials', description: 'GL business unit table' },
  { name: 'PS_LEDGER',      module: 'Financials',   description: 'General ledger' },
  { name: 'PS_ACCOUNT_TBL', module: 'Financials',   description: 'Chart of accounts' },
  { name: 'PS_DEPTID_TBL',  module: 'Financials',   description: 'Department ID table' }
];

// ─────────────────────────────────────────────────────────────────────────────

module.exports = { activate, deactivate };
