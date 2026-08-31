export type {
  HouseholdConfig,
  PublicHouseholdConfig,
  TasksConfig,
  VoluntaryConfig,
  AssignmentConfig,
  BuyoutConfig,
  ValueIncreaseConfig,
  CompletionConfig,
  PointsConfig,
  PointDecayConfig,
  FairnessConfig,
  NotificationsConfig,
} from './types.js';
export { DEFAULT_CONFIG, cloneDefaultConfig, toPublicConfig } from './defaults.js';
export {
  HouseholdConfigSchema,
  validateConfig,
  parseConfig,
  normalizeLegacyConfigInput,
} from './schema.js';
export type { ConfigValidationResult, ConfigFieldError } from './schema.js';
