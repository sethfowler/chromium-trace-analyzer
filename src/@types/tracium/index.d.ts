declare module 'tracium' {
  import { TaskNode } from 'tracium/lib/main-thread-tasks';

  export function computeMainThreadTasks(trace: LH.Trace, options?: {}): TaskNode[];
}
