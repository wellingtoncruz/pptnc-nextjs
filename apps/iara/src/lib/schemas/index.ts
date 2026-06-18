export {
  PodcastSchema,
  PodcastCreateSchema,
  PodcastUpdateSchema,
  PromptsSchema,
  PromptFieldSchema,
  EpisodePromptsSchema,
  CutPromptsSchema,
  ReelPromptsSchema,
  PersonaSchema,
  PersonasSchema,
  VideoTypesConfigSchema,
  TimestampSchema,
  VideoTypeEnum,
  DEFAULT_VIDEO_TYPES,
  DEFAULT_PROMPTS,
  DEFAULT_PERSONAS,
  DEFAULT_PROMPT_FIELD,
  DEFAULT_EPISODE_PROMPTS,
  DEFAULT_PERSONA,
  MAX_PROMPT_LENGTH,
  MAX_ROLE_LENGTH,
  MAX_OBJECTIVE_LENGTH,
  MAX_RESUME_LENGTH,
} from './podcast'

export { VideoTypeConfigSchema } from './video-type-config'

export {
  UserSchema,
  UserCreateSchema,
  UserUpdateSchema,
  UserRoleSchema,
  SaveUserInputSchema,
} from './user'

export {
  VideoSchema,
  VideoCreateSchema,
  VideoUpdateSchema,
  VideoStatusSchema,
  VideoTypeSchema,
  YouTubePrivacyStatusSchema,
  ThumbnailItemSchema,
  ThumbnailsSchema,
  StatisticsSchema,
  ChapterSchema,
  ComplianceSchema,
  ComplianceItemSchema,
  VideoSummarySchema,
} from './video'

export {
  YouTubeVideoItemSchema,
  YouTubeVideosResponseSchema,
  YouTubePlaylistItemSchema,
  YouTubePlaylistItemsResponseSchema,
  YouTubeChannelItemSchema,
  YouTubeChannelsResponseSchema,
  YouTubeThumbnailSchema,
  YouTubeThumbnailsSchema,
  YouTubeSnippetSchema,
  YouTubeContentDetailsSchema,
  YouTubeStatusSchema,
  YouTubeChannelContentDetailsSchema,
} from './youtube-api'

export {
  LinkedInGuestSchema,
  GuestDocSchema,
  GuestDocCreateSchema,
  GuestScrapeRequestSchema,
} from './guest'

export { SocialNetworkSchema, SocialPostSchema, SocialPostUpdateSchema } from './social'

export { AdwordsDataSchema, AdwordsDataCreateSchema, AdwordsLLMResponseSchema } from './adwords'

export {
  NewsletterDataSchema,
  NewsletterDataCreateSchema,
  NewsletterStatusSchema,
  NewsletterNewsItemSchema,
  NewsletterDraftLLMResponseSchema,
  NewsletterNewsLLMResponseSchema,
  NewsletterImageLLMResponseSchema,
  NewsletterFormatLLMResponseSchema,
} from './newsletter'

export { LlmLogSchema, LlmLogCreateSchema } from './llm-log'

// Jobs LLM assíncronos genéricos (Epic 27) — substitui o WizardJob específico.
export { JobSchema, JobCreateSchema, JobUpdateSchema, JobStatusSchema } from './job'
