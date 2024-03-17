import type {
  ContextLog,
  DeprecationLog,
  FetchingProgressLog,
  ExecutionTimeLog,
  HookLog,
  InstallCheckLog,
  LifecycleLog,
  LinkLog,
  PackageImportMethodLog,
  PackageManifestLog,
  PeerDependencyIssuesLog,
  ProgressLog,
  RegistryLog,
  RequestRetryLog,
  RootLog,
  ScopeLog,
  SkippedOptionalDependencyLog,
  StageLog,
  StatsLog,
  SummaryLog,
  UpdateCheckLog,
} from './all'

export * from './all'

export type Log =
  | ContextLog
  | DeprecationLog
  | FetchingProgressLog
  | ExecutionTimeLog
  | HookLog
  | InstallCheckLog
  | LifecycleLog
  | LinkLog
  | PackageManifestLog
  | PackageImportMethodLog
  | PeerDependencyIssuesLog
  | ProgressLog
  | RegistryLog
  | RequestRetryLog
  | RootLog
  | ScopeLog
  | SkippedOptionalDependencyLog
  | StageLog
  | StatsLog
  | SummaryLog
  | UpdateCheckLog
