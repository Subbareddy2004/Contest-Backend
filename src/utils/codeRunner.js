const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Language configurations
const LANGUAGE_CONFIG = {
  java: {
    extension: 'java',
    fileName: 'Main',
    compile: fileName => `javac ${fileName}.java`,
    run: fileName => `java ${fileName}`,
    codexLang: 'java'
  },
  python: {
    extension: 'py',
    compile: null,
    run: fileName => `python ${fileName}.py`,
    codexLang: 'py'
  },
  cpp: {
    extension: 'cpp',
    compile: fileName => `g++ ${fileName}.cpp -o ${fileName}`,
    run: fileName => `./${fileName}`,
    codexLang: 'cpp'
  },
  c: {
    extension: 'c',
    compile: fileName => `gcc ${fileName}.c -o ${fileName}`,
    run: fileName => `./${fileName}`,
    codexLang: 'c'
  },
  javascript: {
    extension: 'js',
    compile: null,
    run: fileName => `node ${fileName}.js`,
    codexLang: 'js'
  }
};

async function runCode(code, language, input) {
  const tmpDir = path.join(__dirname, '../tmp');
  await fs.mkdir(tmpDir, { recursive: true });

  const fileName = `code_${Date.now()}`;
  const langConfig = LANGUAGE_CONFIG[language];

  if (!langConfig) {
    throw new Error('Unsupported language');
  }

  try {
    // Write code file
    const fullPath = path.join(tmpDir, `${fileName}.${langConfig.extension}`);
    await fs.writeFile(fullPath, code);

    // Compile if needed
    if (langConfig.compile) {
      await new Promise((resolve, reject) => {
        exec(langConfig.compile(fileName), { cwd: tmpDir }, (error, stdout, stderr) => {
          if (error) reject(new Error(`Compilation error: ${stderr}`));
          else resolve();
        });
      });
    }

    // Run code
    return new Promise((resolve, reject) => {
      const process = exec(langConfig.run(fileName), { cwd: tmpDir }, (error, stdout, stderr) => {
        // Cleanup
        fs.rm(path.join(tmpDir, `${fileName}*`), { force: true });
        
        if (error && !stderr) {
          reject(new Error('Execution error: ' + error.message));
        } else {
          resolve({
            output: stdout,
            error: stderr
          });
        }
      });

      // Handle input
      if (input) {
        process.stdin.write(input);
        process.stdin.end();
      }

      // Set timeout
      setTimeout(() => {
        process.kill();
        reject(new Error('Execution timeout'));
      }, 10000); // 10 second timeout
    });

  } catch (error) {
    // Cleanup on error
    await fs.rm(path.join(tmpDir, `${fileName}*`), { force: true });
    throw new Error('Failed to execute code: ' + error.message);
  }
}

// Update language mapping for CodeX API
const getCodexLanguage = (language) => {
  const config = LANGUAGE_CONFIG[language];
  return config ? config.codexLang : null;
};

module.exports = { runCode, getCodexLanguage }; 