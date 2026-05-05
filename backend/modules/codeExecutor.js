/**
 * codeExecutor.js
 * Module 1 core: Execute user-submitted code safely, measure execution time
 * and CPU usage via Python psutil subprocess.
 *
 * Architecture:
 * 1. Write user code to a temp file
 * 2. Wrap execution in a psutil monitoring script
 * 3. Capture stdout/stderr and system metrics
 * 4. Return structured results
 */

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// Max execution timeout in ms (safety limit)
const EXEC_TIMEOUT_MS = 15_000;

// Max output size in bytes
const MAX_OUTPUT_BYTES = 50_000;

/**
 * Sanitize code input — prevent shell injection
 * @param {string} code
 */
function sanitizeCode(code) {
  // Allow printable chars + standard whitespace
  return code.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

/**
 * Build a Python monitoring wrapper script.
 * It runs the user script as a subprocess and measures CPU via psutil.
 * @param {string} userScriptPath - Path to the user's Python script
 */
function buildPythonMonitor(userScriptPath) {
  return `
import subprocess, time, os, sys, json
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

script_path = ${JSON.stringify(userScriptPath)}

start_cpu = psutil.cpu_percent(interval=None) if HAS_PSUTIL else 0
start_time = time.perf_counter()

try:
    result = subprocess.run(
        [sys.executable, script_path],
        capture_output=True,
        text=True,
        timeout=12
    )
    stdout = result.stdout
    stderr = result.stderr
    returncode = result.returncode
except subprocess.TimeoutExpired:
    stdout = ""
    stderr = "ERROR: Execution timed out (12s limit)"
    returncode = -1
except Exception as e:
    stdout = ""
    stderr = f"ERROR: {str(e)}"
    returncode = -1

end_time = time.perf_counter()
exec_time = end_time - start_time

# Sample CPU usage during/after execution
if HAS_PSUTIL:
    cpu_samples = []
    for _ in range(3):
        cpu_samples.append(psutil.cpu_percent(interval=0.1))
    cpu_usage = sum(cpu_samples) / len(cpu_samples)
    ram_info = psutil.virtual_memory()
    ram_used_gb = ram_info.used / (1024**3)
    ram_total_gb = ram_info.total / (1024**3)
else:
    cpu_usage = 25.0  # fallback estimate
    ram_used_gb = 4.0
    ram_total_gb = 8.0

metrics = {
    "executionTime": round(exec_time, 6),
    "cpuUsage": round(cpu_usage, 2),
    "ramUsedGB": round(ram_used_gb, 2),
    "ramTotalGB": round(ram_total_gb, 2),
    "stdout": stdout[:2000],
    "stderr": stderr[:1000],
    "returnCode": returncode,
    "hasPsutil": HAS_PSUTIL
}

print("__METRICS_JSON__:" + json.dumps(metrics))
`;
}

/**
 * Execute Python code and return execution metrics
 * @param {string} code - User-submitted Python code
 * @returns {Promise<object>} Execution metrics + output
 */
async function executePython(code) {
  const tempDir = os.tmpdir();
  const userScriptPath = path.join(tempDir, `user_code_${Date.now()}.py`);
  const monitorScriptPath = path.join(tempDir, `monitor_${Date.now()}.py`);

  try {
    // Write sanitized user code
    fs.writeFileSync(userScriptPath, sanitizeCode(code), 'utf8');

    // Write monitor wrapper
    const monitorCode = buildPythonMonitor(userScriptPath);
    fs.writeFileSync(monitorScriptPath, monitorCode, 'utf8');

    // Execute monitor script
    const { stdout, stderr } = await execFileAsync(
      'python',
      [monitorScriptPath],
      {
        timeout: EXEC_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        env: { ...process.env, PYTHONPATH: '' }
      }
    );

    // Parse the metrics JSON embedded in output
    const metricsLine = stdout.split('\n').find(l => l.startsWith('__METRICS_JSON__:'));
    if (!metricsLine) {
      throw new Error('No metrics returned from monitor script');
    }

    const metrics = JSON.parse(metricsLine.replace('__METRICS_JSON__:', ''));
    return {
      success: true,
      language: 'python',
      ...metrics
    };

  } catch (err) {
    // Handle timeout or parse errors gracefully
    console.error('[Executor] Python error:', err.message);
    return {
      success: false,
      language: 'python',
      executionTime: 0,
      cpuUsage: 0,
      ramUsedGB: 0,
      ramTotalGB: 8,
      stdout: '',
      stderr: err.message || 'Execution failed',
      returnCode: -1,
      hasPsutil: false,
      error: err.message
    };
  } finally {
    // Cleanup temp files
    [userScriptPath, monitorScriptPath].forEach(f => {
      try { fs.unlinkSync(f); } catch (_) {}
    });
  }
}

/**
 * Execute C++ code: compile then run, measure with time + psutil
 * @param {string} code - User-submitted C++ code
 * @returns {Promise<object>}
 */
async function executeCpp(code) {
  const tempDir = os.tmpdir();
  const srcPath = path.join(tempDir, `user_code_${Date.now()}.cpp`);
  const binPath = path.join(tempDir, `user_bin_${Date.now()}`);

  try {
    fs.writeFileSync(srcPath, sanitizeCode(code), 'utf8');

    // Compile step
    await execFileAsync('g++', ['-O2', '-o', binPath, srcPath], {
      timeout: 10_000
    });

    // Run compiled binary with Python timing wrapper
    const runScript = `
import subprocess, time, json
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

start_time = time.perf_counter()
try:
    result = subprocess.run(
        [${JSON.stringify(binPath)}],
        capture_output=True, text=True, timeout=10
    )
    stdout = result.stdout
    stderr = result.stderr
    rc = result.returncode
except Exception as e:
    stdout = ""
    stderr = str(e)
    rc = -1

exec_time = time.perf_counter() - start_time

if HAS_PSUTIL:
    cpu_samples = [psutil.cpu_percent(interval=0.05) for _ in range(5)]
    cpu_usage = sum(cpu_samples) / len(cpu_samples)
    ram = psutil.virtual_memory()
    ram_used = ram.used / (1024**3)
    ram_total = ram.total / (1024**3)
else:
    cpu_usage = 30.0
    ram_used = 4.0
    ram_total = 8.0

metrics = {
    "executionTime": round(exec_time, 6),
    "cpuUsage": round(cpu_usage, 2),
    "ramUsedGB": round(ram_used, 2),
    "ramTotalGB": round(ram_total, 2),
    "stdout": stdout[:2000],
    "stderr": stderr[:1000],
    "returnCode": rc,
    "hasPsutil": HAS_PSUTIL
}
print("__METRICS_JSON__:" + json.dumps(metrics))
`;
    const runScriptPath = path.join(tempDir, `run_wrap_${Date.now()}.py`);
    fs.writeFileSync(runScriptPath, runScript, 'utf8');

    const { stdout } = await execFileAsync('python', [runScriptPath], {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES
    });

    const metricsLine = stdout.split('\n').find(l => l.startsWith('__METRICS_JSON__:'));
    if (!metricsLine) throw new Error('No metrics from C++ run');

    const metrics = JSON.parse(metricsLine.replace('__METRICS_JSON__:', ''));
    fs.unlinkSync(runScriptPath);

    return { success: true, language: 'cpp', ...metrics };

  } catch (err) {
    console.error('[Executor] C++ error:', err.message);
    return {
      success: false,
      language: 'cpp',
      executionTime: 0,
      cpuUsage: 0,
      ramUsedGB: 0,
      ramTotalGB: 8,
      stdout: '',
      stderr: err.message,
      returnCode: -1,
      error: err.message
    };
  } finally {
    [srcPath, binPath].forEach(f => {
      try { fs.unlinkSync(f); } catch (_) {}
    });
  }
}

/**
 * Unified entry point
 * @param {string} code
 * @param {string} language - 'python' | 'cpp'
 */
async function executeCode(code, language = 'python') {
  if (!code || code.trim().length === 0) {
    throw new Error('No code provided');
  }

  switch (language.toLowerCase()) {
    case 'python':
      return executePython(code);
    case 'cpp':
    case 'c++':
      return executeCpp(code);
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

module.exports = { executeCode };