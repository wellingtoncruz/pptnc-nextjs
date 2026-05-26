import { describe, it, expect } from 'vitest'

import type { Video } from '@/types/video'

import {
  validatePhaseCompletion,
  getFirstIncompletePhase,
  getAllPhaseValidations,
  phaseNeedsReviewConfirmation,
} from './phase-validation'

// Helper to create minimal video for testing
function createVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'test-video-123',
    title: 'Test Video',
    duration: 3600,
    publishedAt: { toDate: () => new Date(), toMillis: () => Date.now(), seconds: 0, nanoseconds: 0 },
    ...overrides,
  } as Video
}

describe('validatePhaseCompletion', () => {
  describe('Phase 1 (Critique)', () => {
    it('returns incomplete when critique does not exist', () => {
      const video = createVideo()
      const result = validatePhaseCompletion(video, 'critique')

      expect(result.phase).toBe('critique')
      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
      expect(result.requiresReview).toBe(false)
      expect(result.isReviewed).toBe(false)
    })

    it('returns complete when critique exists', () => {
      const video = createVideo({ critique: 'Great episode!' })
      const result = validatePhaseCompletion(video, 'critique')

      expect(result.isComplete).toBe(true)
      expect(result.hasData).toBe(true)
    })

    it('returns incomplete for empty string critique', () => {
      const video = createVideo({ critique: '' })
      const result = validatePhaseCompletion(video, 'critique')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
    })

    it('returns incomplete for whitespace-only critique', () => {
      const video = createVideo({ critique: '   ' })
      const result = validatePhaseCompletion(video, 'critique')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
    })
  })

  describe('Phase 2 (Edit Check) - requires review', () => {
    it('returns incomplete when editingIssues does not exist', () => {
      const video = createVideo()
      const result = validatePhaseCompletion(video, 'edit-check')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
      expect(result.requiresReview).toBe(true)
    })

    it('returns incomplete when editingIssues exists but not reviewed', () => {
      const video = createVideo({
        editingIssues: [{ timestamp: '00:05:30', description: 'Cut issue' }],
      })
      const result = validatePhaseCompletion(video, 'edit-check')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(true)
      expect(result.requiresReview).toBe(true)
      expect(result.isReviewed).toBe(false)
    })

    it('returns complete when editingIssues exists AND reviewed', () => {
      const video = createVideo({
        editingIssues: [],
        reviewedPhases: ['edit-check'],
      })
      const result = validatePhaseCompletion(video, 'edit-check')

      expect(result.isComplete).toBe(true)
      expect(result.hasData).toBe(true)
      expect(result.isReviewed).toBe(true)
    })

    it('handles empty editingIssues array as having data', () => {
      const video = createVideo({
        editingIssues: [],
        reviewedPhases: ['edit-check'],
      })
      const result = validatePhaseCompletion(video, 'edit-check')

      // Empty array means "no issues found" which is valid data
      expect(result.hasData).toBe(true)
      expect(result.isComplete).toBe(true)
    })
  })

  describe('Phase 3 (Compliance) - requires review', () => {
    it('returns incomplete when riskAndCompliance does not exist', () => {
      const video = createVideo()
      const result = validatePhaseCompletion(video, 'risk')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
      expect(result.requiresReview).toBe(true)
    })

    it('returns incomplete when riskAndCompliance exists but not reviewed', () => {
      const video = createVideo({
        riskAndCompliance: [{ timestamp: '00:10:00', risk: 'Brand mention', description: 'Test' }],
      })
      const result = validatePhaseCompletion(video, 'risk')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(true)
      expect(result.isReviewed).toBe(false)
    })

    it('returns complete when riskAndCompliance exists AND reviewed', () => {
      const video = createVideo({
        riskAndCompliance: [],
        reviewedPhases: ['risk'],
      })
      const result = validatePhaseCompletion(video, 'risk')

      expect(result.isComplete).toBe(true)
      expect(result.hasData).toBe(true)
      expect(result.isReviewed).toBe(true)
    })
  })

  describe('Phase 4 (Chapters)', () => {
    it('returns incomplete when chapters does not exist', () => {
      const video = createVideo()
      const result = validatePhaseCompletion(video, 'chapters')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
      expect(result.requiresReview).toBe(false)
    })

    it('returns incomplete for empty chapters array', () => {
      const video = createVideo({ chapters: [] })
      const result = validatePhaseCompletion(video, 'chapters')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
    })

    it('returns complete when chapters exist', () => {
      const video = createVideo({
        chapters: [{ timestamp: '00:00', title: 'Intro' }],
      })
      const result = validatePhaseCompletion(video, 'chapters')

      expect(result.isComplete).toBe(true)
      expect(result.hasData).toBe(true)
    })
  })

  describe('Phase 5 (Title) - uses suggestedTitles', () => {
    it('returns incomplete when suggestedTitles does not exist', () => {
      const video = createVideo()
      const result = validatePhaseCompletion(video, 'title')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
    })

    it('returns incomplete when suggestedTitles is empty', () => {
      const video = createVideo({ suggestedTitles: [] })
      const result = validatePhaseCompletion(video, 'title')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
    })

    it('returns complete when suggestedTitles has content', () => {
      const video = createVideo({ suggestedTitles: ['Title 1', 'Title 2', 'Title 3'] })
      const result = validatePhaseCompletion(video, 'title')

      expect(result.isComplete).toBe(true)
      expect(result.hasData).toBe(true)
    })

    it('ignores title field for phase completion', () => {
      // title exists but suggestedTitles does not - phase is incomplete
      const video = createVideo({ title: 'My Chosen Title' })
      const result = validatePhaseCompletion(video, 'title')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
    })
  })

  describe('Phase 6 (Description)', () => {
    it('returns incomplete when description does not exist', () => {
      const video = createVideo()
      const result = validatePhaseCompletion(video, 'description')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
    })

    it('returns complete when description exists', () => {
      const video = createVideo({ description: 'This is a great episode about...' })
      const result = validatePhaseCompletion(video, 'description')

      expect(result.isComplete).toBe(true)
      expect(result.hasData).toBe(true)
    })
  })

  describe('Phase 7 (Tags)', () => {
    it('returns incomplete when tags does not exist', () => {
      const video = createVideo()
      const result = validatePhaseCompletion(video, 'tags')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
    })

    it('returns incomplete for empty tags array', () => {
      const video = createVideo({ tags: [] })
      const result = validatePhaseCompletion(video, 'tags')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
    })

    it('returns complete when tags exist', () => {
      const video = createVideo({ tags: ['podcast', 'interview'] })
      const result = validatePhaseCompletion(video, 'tags')

      expect(result.isComplete).toBe(true)
      expect(result.hasData).toBe(true)
    })
  })

  describe('Phase 8 (Publish)', () => {
    it('returns incomplete when status is not sent', () => {
      const video = createVideo({ status: 'draft' })
      const result = validatePhaseCompletion(video, 'publish')

      expect(result.isComplete).toBe(false)
      expect(result.hasData).toBe(false)
      expect(result.requiresReview).toBe(false)
    })

    it('returns complete when status is sent', () => {
      const video = createVideo({ status: 'sent' })
      const result = validatePhaseCompletion(video, 'publish')

      expect(result.isComplete).toBe(true)
      expect(result.hasData).toBe(true)
    })
  })
})

describe('getFirstIncompletePhase', () => {
  it('returns 1 for empty video', () => {
    const video = createVideo({ title: '' })
    expect(getFirstIncompletePhase(video)).toBe('critique')
  })

  it('returns 2 when phase 1 complete', () => {
    const video = createVideo({ critique: 'Good!' })
    expect(getFirstIncompletePhase(video)).toBe('edit-check')
  })

  it('returns 2 when phase 1 complete but phase 2 has data without review', () => {
    const video = createVideo({
      critique: 'Good!',
      editingIssues: [],
      // reviewedPhases not set
    })
    expect(getFirstIncompletePhase(video)).toBe('edit-check')
  })

  it('returns 3 when phases 1-2 complete', () => {
    const video = createVideo({
      critique: 'Good!',
      editingIssues: [],
      reviewedPhases: ['edit-check'],
    })
    expect(getFirstIncompletePhase(video)).toBe('risk')
  })

  it('returns 4 when phases 1-3 complete', () => {
    const video = createVideo({
      critique: 'Good!',
      editingIssues: [],
      riskAndCompliance: [],
      reviewedPhases: ['edit-check', 'risk'],
    })
    expect(getFirstIncompletePhase(video)).toBe('chapters')
  })

  it('returns 5 when phases 1-4 complete', () => {
    const video = createVideo({
      critique: 'Good!',
      editingIssues: [],
      riskAndCompliance: [],
      chapters: [{ timestamp: '00:00', title: 'Intro' }],
      // No suggestedTitles = phase 5 incomplete
      reviewedPhases: ['edit-check', 'risk'],
    })
    expect(getFirstIncompletePhase(video)).toBe('title')
  })

  it('returns 8 when all phases complete', () => {
    const video = createVideo({
      critique: 'Good!',
      editingIssues: [],
      riskAndCompliance: [],
      chapters: [{ timestamp: '00:00', title: 'Intro' }],
      suggestedTitles: ['Title 1', 'Title 2'],
      description: 'Description',
      tags: ['tag1'],
      reviewedPhases: ['edit-check', 'risk'],
    })
    expect(getFirstIncompletePhase(video)).toBe('publish')
  })

  it('returns 8 when video is fully sent', () => {
    const video = createVideo({
      critique: 'Good!',
      editingIssues: [],
      riskAndCompliance: [],
      chapters: [{ timestamp: '00:00', title: 'Intro' }],
      suggestedTitles: ['Title 1', 'Title 2'],
      description: 'Description',
      tags: ['tag1'],
      reviewedPhases: ['edit-check', 'risk'],
      status: 'sent',
    })
    // Even when sent, getFirstIncompletePhase returns 8
    // because that's the last phase to check
    expect(getFirstIncompletePhase(video)).toBe('publish')
  })
})

describe('getAllPhaseValidations', () => {
  it('returns validations for all 8 phases', () => {
    const video = createVideo()
    const validations = getAllPhaseValidations(video)

    expect(validations).toHaveLength(8)
    expect(validations.map(v => v.phase)).toEqual(['critique', 'edit-check', 'risk', 'chapters', 'title', 'description', 'tags', 'publish'])
  })

  it('marks correct phases as requiring review', () => {
    const video = createVideo()
    const validations = getAllPhaseValidations(video)

    const requiresReview = validations.filter(v => v.requiresReview)
    expect(requiresReview.map(v => v.phase)).toEqual(['edit-check', 'risk'])
  })

  it('correctly identifies completed phases', () => {
    const video = createVideo({
      title: '', // Empty title = phase 5 incomplete
      critique: 'Good!',
      editingIssues: [],
      reviewedPhases: ['edit-check'],
    })
    const validations = getAllPhaseValidations(video)

    const completed = validations.filter(v => v.isComplete)
    expect(completed.map(v => v.phase)).toEqual(['critique', 'edit-check'])
  })
})

describe('phaseNeedsReviewConfirmation', () => {
  it('returns false for phase 1 (no review required)', () => {
    const video = createVideo({ critique: 'Good!' })
    expect(phaseNeedsReviewConfirmation(video, 'critique')).toBe(false)
  })

  it('returns true for phase 2 with data but not reviewed', () => {
    const video = createVideo({ editingIssues: [] })
    expect(phaseNeedsReviewConfirmation(video, 'edit-check')).toBe(true)
  })

  it('returns false for phase 2 already reviewed', () => {
    const video = createVideo({
      editingIssues: [],
      reviewedPhases: ['edit-check'],
    })
    expect(phaseNeedsReviewConfirmation(video, 'edit-check')).toBe(false)
  })

  it('returns false for phase 2 without data', () => {
    const video = createVideo()
    expect(phaseNeedsReviewConfirmation(video, 'edit-check')).toBe(false)
  })

  it('returns true for phase 3 with data but not reviewed', () => {
    const video = createVideo({ riskAndCompliance: [] })
    expect(phaseNeedsReviewConfirmation(video, 'risk')).toBe(true)
  })

  it('returns false for phase 3 already reviewed', () => {
    const video = createVideo({
      riskAndCompliance: [],
      reviewedPhases: ['risk'],
    })
    expect(phaseNeedsReviewConfirmation(video, 'risk')).toBe(false)
  })

  it('returns false for phase 4 (no review required)', () => {
    const video = createVideo({
      chapters: [{ timestamp: '00:00', title: 'Intro' }],
    })
    expect(phaseNeedsReviewConfirmation(video, 'chapters')).toBe(false)
  })
})
