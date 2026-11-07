### pts-250K-10hz-60fps.aura.trace.trace.json.gz

trace span 9246 ms, 73351 events

| process | thread | busy ms | busy % of span |
|---|---|---|---|
| Renderer | CrRendererMain | 8723 | 94% |
| GPU Process | CrGpuMain | 40 | 0% |
| Renderer | ThreadPoolForegroundWorker | 37 | 0% |
| Renderer | ThreadPoolForegroundWorker | 29 | 0% |
| Renderer | Compositor | 29 | 0% |
| GPU Process | VizCompositorThread | 23 | 0% |
| Renderer | ThreadPoolForegroundWorker | 22 | 0% |
| Renderer | ThreadPoolForegroundWorker | 22 | 0% |
| Renderer | ThreadPoolForegroundWorker | 21 | 0% |
| Renderer | ThreadPoolForegroundWorker | 21 | 0% |
| Renderer | ThreadPoolForegroundWorker | 15 | 0% |
| Renderer | ThreadPoolForegroundWorker | 15 | 0% |

Top events on `Renderer / CrRendererMain` by self ms

| event | self ms | total ms | count |
|---|---|---|---|
| FunctionCall | 8608 | 8709 | 141 |
| V8.GC_SCAVENGER_SCAVENGE | 20 | 60 | 657 |
| V8.GC_MC_FINISH | 11 | 11 | 13 |
| V8.GC_SCAVENGER_SCAVENGE_PARALLEL_PHASE | 11 | 23 | 657 |
| V8.GC_SCAVENGER_SCAVENGE_FINALIZE | 8 | 8 | 657 |
| V8.GC_SCAVENGER_SCAVENGE_ROOTS | 8 | 8 | 657 |
| MinorGC | 8 | 72 | 657 |
| V8.GC_SCAVENGER_SCAVENGE_PARALLEL | 3 | 3 | 524 |
| RunTask | 3 | 8720 | 593 |
| V8.GC_SCAVENGER_SCAVENGE_COLLECT_OLD_TO_NEW_PAGES | 3 | 3 | 657 |

Top events on `GPU Process / CrGpuMain` by self ms

| event | self ms | total ms | count |
|---|---|---|---|
| CommandBufferService:PutChanged | 25 | 25 | 106 |
| IOSurfaceImageBacking::WaitForCommandsToBeScheduled::ANGLE | 5 | 5 | 62 |
| CommitPresentedFrameToCA | 3 | 4 | 62 |
| RunTask | 2 | 40 | 664 |
| CARendererLayerTree::CommitScheduledCALayers | 1 | 1 | 62 |
| GPUTask | 1 | 26 | 114 |
| SkiaOutputDevice->ScheduleOverlays() | 1 | 6 | 62 |
| CommandBufferStub::PerformWork | 1 | 1 | 356 |
| GpuChannel::ExecuteDeferredRequest | 0 | 26 | 110 |
| Scheduler::RunTask | 0 | 38 | 172 |

Top events on `Renderer / ThreadPoolForegroundWorker` by self ms

| event | self ms | total ms | count |
|---|---|---|---|
| V8.GC_MC_BACKGROUND_MARKING | 20 | 20 | 31 |
| V8.GC_BACKGROUND_FULL_ARRAY_BUFFER_SWEEP | 11 | 11 | 13 |
| V8.GC_SCAVENGER_BACKGROUND_SCAVENGE_PARALLEL | 5 | 5 | 496 |
| V8.GC_BACKGROUND_YOUNG_ARRAY_BUFFER_SWEEP | 1 | 1 | 287 |
| V8.GC_MC_CLEAR_STRING_TABLE | 0 | 0 | 7 |
| V8.GC_MINOR_MS_BACKGROUND_SWEEPING | 0 | 0 | 213 |
| V8.GC_MC_CLEAR_WEAK_REFERENCES_TRIVIAL | 0 | 0 | 2 |
| ArrayBufferSweeper Finished | 0 | 0 | 84 |
| V8.GC_MC_BACKGROUND_SWEEPING | 0 | 0 | 2 |
| V8.GC_MC_BACKGROUND_EVACUATE_UPDATE_POINTERS | 0 | 0 | 6 |

Top events on `Renderer / ThreadPoolForegroundWorker` by self ms

| event | self ms | total ms | count |
|---|---|---|---|
| V8.GC_MC_BACKGROUND_MARKING | 20 | 20 | 29 |
| V8.GC_MC_BACKGROUND_SWEEPING | 4 | 4 | 19 |
| V8.GC_SCAVENGER_BACKGROUND_SCAVENGE_PARALLEL | 4 | 4 | 461 |
| V8.GC_MC_CLEAR_STRING_TABLE | 0 | 0 | 5 |
| V8.GC_MC_CLEAR_WEAK_REFERENCES_TRIVIAL | 0 | 0 | 1 |
| V8.GC_MC_CLEAR_MAPS | 0 | 0 | 4 |
| V8.GC_MC_CLEAR_SWEEP_EXTERNAL_POINTER_TABLE | 0 | 0 | 1 |
| V8.GC_MC_CLEAR_WEAK_LISTS | 0 | 0 | 5 |
| V8.GC_MC_BACKGROUND_EVACUATE_COPY | 0 | 0 | 1 |
| V8.GC_MC_CLEAR_SWEEP_JS_DISPATCH_TABLE | 0 | 0 | 1 |

GPU/viz process threads

| process | thread | busy ms | busy % |
|---|---|---|---|
| GPU Process | CrGpuMain | 40 | 0% |
| Renderer | Compositor | 29 | 0% |
| GPU Process | VizCompositorThread | 23 | 0% |
| GPU Process | Chrome_ChildIOThread | 1 | 0% |
| GPU Process | PerfettoTrace | 0 | 0% |
