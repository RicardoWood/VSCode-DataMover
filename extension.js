// extension.js
// PeopleSoft DataMover VS Code Extension
// Main entry point — currently grammar-only, but structured for future enhancements.

const vscode = require('vscode');

/**
 * Called when the extension is activated (i.e. when a .dms or .dmt file is opened).
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('PeopleSoft DataMover extension activated.');

  // Register a hover provider for DataMover commands
  const hoverProvider = vscode.languages.registerHoverProvider('datamover', {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(position, /[A-Z_][A-Z0-9_]*/i);
      if (!range) return;

      const word = document.getText(range).toUpperCase();
      const info = COMMAND_INFO[word];

      if (info) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${word}**\n\n${info.description}`);
        if (info.syntax) {
          md.appendMarkdown(`\n\n*Syntax:*\n\`\`\`datamover\n${info.syntax}\n\`\`\``);
        }
        if (info.example) {
          md.appendMarkdown(`\n\n*Example:*\n\`\`\`datamover\n${info.example}\n\`\`\``);
        }
        return new vscode.Hover(md, range);
      }
    }
  });

  context.subscriptions.push(hoverProvider);
}

function deactivate() {}

// ─── Command Documentation ────────────────────────────────────────────────────

const COMMAND_INFO = {
  EXPORT: {
    description: 'Exports data from the PeopleSoft database to a file.',
    syntax: 'EXPORT record_name;',
    example: 'EXPORT PS_JOB;'
  },
  IMPORT: {
    description: 'Imports data from a file into the PeopleSoft database.',
    syntax: 'IMPORT record_name;',
    example: 'IMPORT PS_JOB;'
  },
  REPLACE_ALL: {
    description: 'Deletes all existing rows for the record before importing. Sets the import mode to replace all existing data.',
    syntax: 'REPLACE_ALL record_name;',
    example: 'REPLACE_ALL PS_INSTALLATION;'
  },
  REPLACE_DATA: {
    description: 'Replaces existing data rows but preserves any rows not present in the import file.',
    syntax: 'REPLACE_DATA record_name;',
    example: 'REPLACE_DATA PS_DEPT_TBL;'
  },
  REPLACE_NONE: {
    description: 'Does not replace existing rows. Only inserts rows that do not already exist.',
    syntax: 'REPLACE_NONE record_name;',
    example: 'REPLACE_NONE PS_JOBCODE_TBL;'
  },
  SET: {
    description: 'Sets a DataMover environment option such as INPUT, OUTPUT, LOG, or other configuration parameters.',
    syntax: 'SET option_name value;',
    example: 'SET LOG c:\\temp\\datamover.log;\nSET OUTPUT c:\\temp\\export.dat;'
  },
  REM: {
    description: 'Remark (comment) line. The remainder of the line is ignored by DataMover.',
    syntax: 'REM comment text;',
    example: 'REM Export all job records for the US BU;'
  },
  DELETE_ROWS: {
    description: 'Deletes rows from the specified record in the database.',
    syntax: 'DELETE_ROWS record_name;',
    example: 'DELETE_ROWS PS_TEMP_WORK;'
  },
  ENCRYPT_PASSWORD: {
    description: 'Encrypts a plain-text password and stores it in the access profile.',
    syntax: 'ENCRYPT_PASSWORD password;',
    example: 'ENCRYPT_PASSWORD mypassword;'
  },
  RENAME: {
    description: 'Renames a record definition in the database.',
    syntax: 'RENAME RECORD old_name AS new_name;',
    example: 'RENAME RECORD PS_OLD_TABLE AS PS_NEW_TABLE;'
  },
  SWAP_BASE_LANGUAGE: {
    description: 'Swaps the base language of the database with a specified language.',
    syntax: 'SWAP_BASE_LANGUAGE language_cd;',
    example: 'SWAP_BASE_LANGUAGE FRA;'
  },
  IF: {
    description: 'Begins a conditional block. Supports IF / ELSE / END-IF constructs.',
    syntax: 'IF condition\n  statements;\nELSE\n  statements;\nEND-IF',
    example: 'IF #DBTYPE = "ORACLE"\n  EXPORT PS_INSTALLATION;\nEND-IF'
  },
  'END-IF': {
    description: 'Closes an IF conditional block.',
    syntax: 'END-IF',
    example: 'IF #DBTYPE = "ORACLE"\n  EXPORT PS_JOB;\nEND-IF'
  },
  STOP: {
    description: 'Stops script execution immediately.',
    syntax: 'STOP;',
    example: 'IF #RESULT = 0\n  STOP;\nEND-IF'
  }
};

module.exports = { activate, deactivate };
