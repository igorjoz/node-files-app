/**
 * Worker thread for text file analysis.
 * Counts words and sentences in a given file.
 */

import { parentPort, workerData } from 'worker_threads';
import { readFile } from 'fs/promises';

const { filePath, workerId } = workerData;

/**
 * Counts words in text
 * @param {string} text 
 * @returns {number}
 */
function countWords(text) {
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    return words.length;
}

/**
 * Counts sentences in text (endings: . ! ?)
 * @param {string} text 
 * @returns {number}
 */
function countSentences(text) {
    // Ignore multiple punctuation marks (for example "..." or "!?")
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences.length;
}

async function analyzeFile() {
    const startTime = Date.now();
    console.log(`[Worker ${workerId}] START - Analyzing file: ${filePath}`);
    
    try {
        const content = await readFile(filePath, 'utf-8');
        
        const wordCount = countWords(content);
        const sentenceCount = countSentences(content);
        
        const endTime = Date.now();
        console.log(`[Worker ${workerId}] END - File: ${filePath} (time: ${endTime - startTime}ms)`);
        
        parentPort.postMessage({
            success: true,
            filePath,
            wordCount,
            sentenceCount,
            workerId
        });
    } catch (error) {
        console.log(`[Worker ${workerId}] ERROR - File: ${filePath} - ${error.message}`);
        parentPort.postMessage({
            success: false,
            filePath,
            error: error.message,
            workerId
        });
    }
}

analyzeFile();
