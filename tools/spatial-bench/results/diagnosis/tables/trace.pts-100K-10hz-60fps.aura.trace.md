### pts-100K-10hz-60fps.aura.trace.trace.json.gz

trace span 6047 ms, 97300 events

| process | thread | busy ms | busy % of span |
|---|---|---|---|
| Renderer | CrRendererMain | 5950 | 98% |
| GPU Process | CrGpuMain | 88 | 1% |
| Renderer | Compositor | 54 | 1% |
| GPU Process | VizCompositorThread | 37 | 1% |
| Browser | CrBrowserMain | 35 | 1% |
| Renderer | ThreadPoolForegroundWorker | 29 | 0% |
| Renderer | ThreadPoolForegroundWorker | 17 | 0% |
| Renderer | ThreadPoolForegroundWorker | 13 | 0% |
| Renderer | ThreadPoolForegroundWorker | 12 | 0% |
| Renderer | ThreadPoolForegroundWorker | 10 | 0% |
| Browser | Gamepad polling thread | 8 | 0% |
| Renderer | ThreadPoolForegroundWorker | 8 | 0% |

Top events on `Renderer / CrRendererMain` by self ms

| event | self ms | total ms | count |
|---|---|---|---|
| FunctionCall | 5835 | 5919 | 340 |
| V8.GC_SCAVENGER_SCAVENGE | 16 | 60 | 388 |
| V8.GC_SCAVENGER_SCAVENGE_PARALLEL_PHASE | 13 | 24 | 388 |
| V8.GC_SCAVENGER_SCAVENGE_FINALIZE | 9 | 9 | 388 |
| V8.GC_SCAVENGER_SCAVENGE_ROOTS | 7 | 7 | 388 |
| MinorGC | 7 | 71 | 388 |
| RunTask | 6 | 5949 | 1454 |
| V8.GC_SCAVENGER_SCAVENGE_PARALLEL | 4 | 4 | 320 |
| Commit | 3 | 6 | 163 |
| Blink.PrePaint.UpdateTime | 3 | 3 | 163 |

Top events on `GPU Process / CrGpuMain` by self ms

| event | self ms | total ms | count |
|---|---|---|---|
| CommandBufferService:PutChanged | 48 | 48 | 265 |
| IOSurfaceImageBacking::WaitForCommandsToBeScheduled::ANGLE | 13 | 13 | 163 |
| CommitPresentedFrameToCA | 9 | 13 | 165 |
| CARendererLayerTree::CommitScheduledCALayers | 4 | 4 | 165 |
| RunTask | 3 | 88 | 1517 |
| SkiaOutputDevice->ScheduleOverlays() | 3 | 16 | 165 |
| GPUTask | 2 | 51 | 268 |
| CommandBufferStub::PerformWork | 2 | 2 | 742 |
| Scheduler::RunTask | 1 | 84 | 440 |
| Graphics.Pipeline | 1 | 30 | 330 |

Top events on `Renderer / Compositor` by self ms

| event | self ms | total ms | count |
|---|---|---|---|
| GpuChannelHost::VerifyFlush | 13 | 13 | 147 |
| Graphics.Pipeline | 10 | 36 | 881 |
| RunTask | 4 | 47 | 1815 |
| Scheduler::BeginImplFrame | 3 | 3 | 359 |
| ExternalBeginFrameSource::OnBeginFrame | 2 | 6 | 359 |
| ProxyImpl::ReadyToCommit | 1 | 11 | 163 |
| TileManager::ScheduleTasks | 1 | 2 | 163 |
| Scheduler::BeginFrame | 1 | 5 | 359 |
| ProxyImpl::Commit | 1 | 3 | 163 |
| LayerTreeHostImpl::CommitComplete | 1 | 3 | 163 |

Top events on `GPU Process / VizCompositorThread` by self ms

| event | self ms | total ms | count |
|---|---|---|---|
| Graphics.Pipeline | 14 | 25 | 1385 |
| RunTask | 10 | 37 | 1390 |
| ExternalBeginFrameSource::OnBeginFrame | 2 | 10 | 362 |
| DisplayScheduler::BeginFrame | 2 | 3 | 349 |
| Surface::ActivateFrame | 2 | 2 | 165 |
| DisplayScheduler::ScheduleBeginFrameDeadline | 1 | 1 | 647 |
| SkiaOutputSurfaceImpl::FlushGpuTasks | 1 | 1 | 167 |
| SurfaceManager::GarbageCollectSurfaces | 1 | 1 | 169 |
| DirectRenderer::DrawFrame | 1 | 2 | 165 |
| OverlayProcessorMac::ProcessForOverlays | 1 | 1 | 165 |

GPU/viz process threads

| process | thread | busy ms | busy % |
|---|---|---|---|
| GPU Process | CrGpuMain | 88 | 1% |
| Renderer | Compositor | 54 | 1% |
| GPU Process | VizCompositorThread | 37 | 1% |
| GPU Process | Chrome_ChildIOThread | 2 | 0% |
| GPU Process | PerfettoTrace | 0 | 0% |
