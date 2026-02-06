---
"@cerios/csv-nested-json": minor
---

Add streaming parser enhancements for large file handling

**Progress Callback for Large Files**
- New `progressCallback` option to receive progress updates during parsing
- New `progressInterval` option to control how often callbacks are triggered (default: every 100 records)
- `ProgressInfo` includes: `bytesProcessed`, `recordsEmitted`, `headersProcessed`, `elapsedMs`
- Supports both synchronous and asynchronous callbacks

**Batch Processing for Streams**
- New `batchSize` option to emit records in batches instead of one-by-one
- When `batchSize > 1`, the streaming API emits arrays of records
- `parseStream()` always returns a flat array regardless of batch size
- Improves performance for high-throughput scenarios

**Limit Option**
- New `limit` option to stop parsing after N records
- Applied after row filtering (filtered rows don't count toward limit)
- Works with both streaming API and `parseStream()` method

**Memory Leak Prevention**
- Added proper `_destroy()` method for resource cleanup
- Clears internal buffers, headers, and sets on destroy
- Proper cleanup on stream errors in `parseStream()`
