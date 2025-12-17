/**
 * HTTP Server for text file analysis.
 * 
 * Endpoints:
 * GET /analyze?dir=<path>&useWorkers=true|false
 * 
 * Parameters:
 * - dir: path to the directory with text files
 * - useWorkers: whether to use worker_threads (default: true)
 */

import http from 'http';
import { URL } from 'url';
import { readdir, readFile } from 'fs/promises';
import { join, extname } from 'path';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3000;
const TEXT_EXTENSIONS = ['.txt', '.md', '.text', '.log'];

function countWords(text) {
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    return words.length;
}

function countSentences(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences.length;
}

async function findTextFiles(dirPath) {
    const files = await readdir(dirPath, { withFileTypes: true });
    const textFiles = [];
    
    for (const file of files) {
        if (file.isFile() && TEXT_EXTENSIONS.includes(extname(file.name).toLowerCase())) {
            textFiles.push(join(dirPath, file.name));
        }
    }
    
    return textFiles;
}

// Analyzes file asynchronously (without worker threads)
async function analyzeFileAsync(filePath, index) {
    const startTime = Date.now();
    console.log(`[Async ${index}] START - Analyzing file: ${filePath}`);
    
    try {
        const content = await readFile(filePath, 'utf-8');
        const wordCount = countWords(content);
        const sentenceCount = countSentences(content);
        
        const endTime = Date.now();
        console.log(`[Async ${index}] END - File: ${filePath} (time: ${endTime - startTime}ms)`);
        
        return {
            success: true,
            filePath,
            wordCount,
            sentenceCount
        };
    } catch (error) {
        console.log(`[Async ${index}] ERROR - File: ${filePath} - ${error.message}`);
        return {
            success: false,
            filePath,
            error: error.message
        };
    }
}

// Analyzes file using Worker Thread
function analyzeFileWithWorker(filePath, workerId) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(join(__dirname, 'fileWorker.js'), {
            workerData: { filePath, workerId }
        });
        
        worker.on('message', (result) => {
            resolve(result);
        });
        
        worker.on('error', (error) => {
            reject(error);
        });
        
        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker exited with code ${code}`));
            }
        });
    });
}

async function analyzeDirectory(dirPath, useWorkers = true) {
    const requestId = Date.now();
    const startTime = Date.now();
    
    console.log('\n' + '='.repeat(60));
    console.log(`[Request ${requestId}] START`);
    console.log(`[Request ${requestId}] Directory: ${dirPath}`);
    console.log(`[Request ${requestId}] Mode: ${useWorkers ? 'Worker Threads' : 'Async/Await'}`);
    
    const textFiles = await findTextFiles(dirPath);
    console.log(`[Request ${requestId}] Text files found: ${textFiles.length}`);
    console.log(`[Request ${requestId}] Number of threads/tasks: ${textFiles.length}`);
    console.log('='.repeat(60));
    
    let results;
    
    if (useWorkers) {
        // Using Worker Threads - each file in a separate thread
        const workerPromises = textFiles.map((filePath, index) => 
            analyzeFileWithWorker(filePath, index + 1)
        );
        results = await Promise.all(workerPromises);
    } else {
        // Using async/await - asynchronous operations without separate threads
        const asyncPromises = textFiles.map((filePath, index) => 
            analyzeFileAsync(filePath, index + 1)
        );
        results = await Promise.all(asyncPromises);
    }
    
    const endTime = Date.now();
    console.log('='.repeat(60));
    console.log(`[Request ${requestId}] END`);
    console.log(`[Request ${requestId}] Total time: ${endTime - startTime}ms`);
    console.log(`[Request ${requestId}] Files processed: ${results.length}`);
    console.log('='.repeat(60) + '\n');
    
    return {
        requestId,
        directory: dirPath,
        useWorkers,
        totalFiles: textFiles.length,
        totalTime: endTime - startTime,
        results
    };
}

function formatResults(analysisResult) {
    const lines = [
        `Directory analysis: ${analysisResult.directory}`,
        `Mode: ${analysisResult.useWorkers ? 'Worker Threads' : 'Async/Await'}`,
        `Number of files: ${analysisResult.totalFiles}`,
        `Execution time: ${analysisResult.totalTime}ms`,
        '',
        'Results:',
        '-'.repeat(60)
    ];
    
    for (const result of analysisResult.results) {
        if (result.success) {
            const fileName = result.filePath.split(/[/\\]/).pop();
            lines.push(`${fileName} - ${result.wordCount} words - ${result.sentenceCount} sentences`);
        } else {
            const fileName = result.filePath.split(/[/\\]/).pop();
            lines.push(`${fileName} - ERROR: ${result.error}`);
        }
    }
    
    lines.push('-'.repeat(60));
    
    return lines.join('\n');
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    
    if (parsedUrl.pathname === '/analyze' && req.method === 'GET') {
        const dirPath = parsedUrl.searchParams.get('dir');
        const useWorkers = parsedUrl.searchParams.get('useWorkers') !== 'false';
        
        if (!dirPath) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Error: Missing "dir" parameter. Usage: /analyze?dir=<path>&useWorkers=true|false');
            return;
        }
        
        try {
            const result = await analyzeDirectory(dirPath, useWorkers);
            const formattedResult = formatResults(result);
            
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(formattedResult);
        } catch (error) {
            console.error(`Error during analysis: ${error.message}`);
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`Server error: ${error.message}`);
        }
    } else if (parsedUrl.pathname === '/' && req.method === 'GET') {
        try {
            const htmlContent = await readFile(join(__dirname, 'public', 'index.html'), 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlContent);
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Error loading page');
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Page not found. Use: GET /analyze?dir=<path>');
    }
});

server.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Text File Analyzer`);
    console.log(`🔗 http://localhost:${PORT}/`);
    console.log('='.repeat(60));
    console.log('');
    console.log('Available endpoints:');
    console.log(`  GET /analyze?dir=<path>&useWorkers=true|false`);
    console.log('');
    console.log('Example:');
    console.log(`  http://localhost:${PORT}/analyze?dir=./test-files`);
    console.log('='.repeat(60));
});
