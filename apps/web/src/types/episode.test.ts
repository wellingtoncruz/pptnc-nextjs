import { describe, it, expect } from "vitest";

import type {
  Episode,
  EpisodeEntity,
  EpisodeThumbnails,
  EpisodeStatistics,
  EpisodeContentDetails,
} from "./episode";
import type { Guest } from "./guest";
import type { Topic } from "./topic";

describe("Episode type", () => {
  it("accepts valid episode data with all required fields", () => {
    const episode: Episode = {
      id: "0dexQ7BDHME",
      slug: "agile-trends-2022",
      title: "Agile Trends 2022",
      description: "Descrição do episódio",
      publishedAt: new Date("2022-04-06"),
      duration: 596,
      youtubeId: "0dexQ7BDHME",
      thumbnails: {
        default: { url: "https://example.com/default.jpg", width: 120, height: 90 },
        medium: { url: "https://example.com/medium.jpg", width: 320, height: 180 },
        high: { url: "https://example.com/high.jpg", width: 480, height: 360 },
      },
      thumbnailUrl: "https://example.com/high.jpg",
      channelId: "UCOvTsuQyJq-fpydse7BY2PQ",
      channelTitle: "PPT Não Compila",
      playlistId: "UUOvTsuQyJq-fpydse7BY2PQ",
      position: 2148,
      statistics: {
        commentCount: "1",
        favoriteCount: "0",
        viewCount: "153",
        likeCount: "4",
      },
      contentDetails: {
        caption: "false",
        dimension: "2d",
        duration: "PT9M56S",
        definition: "hd",
        contentRating: {},
        projection: "rectangular",
        licensedContent: true,
      },
      guests: [],
      topics: [],
    };

    expect(episode.id).toBe("0dexQ7BDHME");
    expect(episode.youtubeId).toBe("0dexQ7BDHME");
    expect(episode.duration).toBe(596);
    expect(episode.statistics.viewCount).toBe("153");
  });

  it("allows optional fields to be undefined", () => {
    const episode: Episode = {
      id: "test-id",
      slug: "test-slug",
      title: "Test Episode",
      description: "Test description",
      publishedAt: new Date(),
      duration: 100,
      youtubeId: "test-id",
      thumbnails: {
        default: { url: "", width: 0, height: 0 },
        medium: { url: "", width: 0, height: 0 },
        high: { url: "", width: 0, height: 0 },
      },
      thumbnailUrl: "",
      channelId: "",
      channelTitle: "",
      playlistId: "",
      position: 0,
      statistics: {
        commentCount: "0",
        favoriteCount: "0",
        viewCount: "0",
        likeCount: "0",
      },
      contentDetails: {
        caption: "false",
        dimension: "2d",
        duration: "",
        definition: "hd",
        contentRating: {},
        projection: "rectangular",
        licensedContent: false,
      },
      guests: [],
      topics: [],
    };

    expect(episode.transcript).toBeUndefined();
    expect(episode.transcriptSrt).toBeUndefined();
    expect(episode.spotifyUrl).toBeUndefined();
    expect(episode.audioUrl).toBeUndefined();
  });

  it("accepts episode with guests and topics (future fields)", () => {
    const guest: Guest = {
      id: "guest-001",
      name: "João Silva",
      bio: "Especialista em tecnologia",
    };

    const episode: Episode = {
      id: "test-id",
      slug: "com-convidado",
      title: "Episódio com Convidado",
      description: "Entrevista",
      publishedAt: new Date(),
      duration: 2400,
      youtubeId: "test-id",
      thumbnails: {
        default: { url: "", width: 0, height: 0 },
        medium: { url: "", width: 0, height: 0 },
        high: { url: "", width: 0, height: 0 },
      },
      thumbnailUrl: "",
      channelId: "",
      channelTitle: "",
      playlistId: "",
      position: 0,
      statistics: {
        commentCount: "0",
        favoriteCount: "0",
        viewCount: "0",
        likeCount: "0",
      },
      contentDetails: {
        caption: "false",
        dimension: "2d",
        duration: "",
        definition: "hd",
        contentRating: {},
        projection: "rectangular",
        licensedContent: false,
      },
      guests: [guest],
      topics: ["entrevista", "tecnologia"],
    };

    expect(episode.guests).toHaveLength(1);
    expect(episode.guests[0].name).toBe("João Silva");
    expect(episode.topics).toContain("tecnologia");
  });
});

describe("Guest type", () => {
  it("accepts minimal guest data", () => {
    const guest: Guest = {
      id: "guest-001",
      name: "Maria Santos",
    };

    expect(guest.id).toBe("guest-001");
    expect(guest.name).toBe("Maria Santos");
    expect(guest.bio).toBeUndefined();
  });

  it("accepts full guest data with social links", () => {
    const guest: Guest = {
      id: "guest-002",
      name: "Pedro Oliveira",
      bio: "Desenvolvedor de software",
      photoUrl: "https://example.com/photo.jpg",
      socialLinks: {
        twitter: "https://twitter.com/pedro",
        linkedin: "https://linkedin.com/in/pedro",
        website: "https://pedro.dev",
      },
    };

    expect(guest.socialLinks?.twitter).toBe("https://twitter.com/pedro");
    expect(guest.socialLinks?.linkedin).toBeDefined();
    expect(guest.socialLinks?.website).toBeDefined();
  });
});

describe("Topic type", () => {
  it("accepts valid topic data", () => {
    const topic: Topic = {
      id: "topic-001",
      name: "Tecnologia",
      slug: "tecnologia",
      episodeCount: 15,
    };

    expect(topic.name).toBe("Tecnologia");
    expect(topic.slug).toBe("tecnologia");
    expect(topic.episodeCount).toBe(15);
  });
});

describe("EpisodeEntity type (Datastore schema)", () => {
  it("accepts publishedAt as ISO string", () => {
    const entity: EpisodeEntity = {
      title: "Test",
      description: "Test",
      publishedAt: "2022-04-06T13:12:55Z",
      duration: 100,
      playlistId: "playlist-1",
      thumbnails: {
        default: { url: "", width: 0, height: 0 },
        medium: { url: "", width: 0, height: 0 },
        high: { url: "", width: 0, height: 0 },
      },
      resourceId: { kind: "youtube#video", videoId: "abc" },
      statistics: {
        commentCount: "0",
        favoriteCount: "0",
        viewCount: "0",
        likeCount: "0",
      },
      contentDetails: {
        caption: "false",
        dimension: "2d",
        duration: "",
        definition: "hd",
        contentRating: {},
        projection: "rectangular",
        licensedContent: false,
      },
      channelId: "",
      channelTitle: "",
      videoOwnerChannelId: "",
      videoOwnerChannelTitle: "",
      position: 0,
    };

    expect(typeof entity.publishedAt).toBe("string");
  });

  it("accepts publishedAt as Date", () => {
    const entity: EpisodeEntity = {
      title: "Test",
      description: "Test",
      publishedAt: new Date(),
      duration: 100,
      playlistId: "playlist-1",
      thumbnails: {
        default: { url: "", width: 0, height: 0 },
        medium: { url: "", width: 0, height: 0 },
        high: { url: "", width: 0, height: 0 },
      },
      resourceId: { kind: "youtube#video", videoId: "abc" },
      statistics: {
        commentCount: "0",
        favoriteCount: "0",
        viewCount: "0",
        likeCount: "0",
      },
      contentDetails: {
        caption: "false",
        dimension: "2d",
        duration: "",
        definition: "hd",
        contentRating: {},
        projection: "rectangular",
        licensedContent: false,
      },
      channelId: "",
      channelTitle: "",
      videoOwnerChannelId: "",
      videoOwnerChannelTitle: "",
      position: 0,
    };

    expect(entity.publishedAt).toBeInstanceOf(Date);
  });

  it("accepts publishedAt as timestamp number", () => {
    const entity: EpisodeEntity = {
      title: "Test",
      description: "Test",
      publishedAt: 1649250775000,
      duration: 100,
      playlistId: "playlist-1",
      thumbnails: {
        default: { url: "", width: 0, height: 0 },
        medium: { url: "", width: 0, height: 0 },
        high: { url: "", width: 0, height: 0 },
      },
      resourceId: { kind: "youtube#video", videoId: "abc" },
      statistics: {
        commentCount: "0",
        favoriteCount: "0",
        viewCount: "0",
        likeCount: "0",
      },
      contentDetails: {
        caption: "false",
        dimension: "2d",
        duration: "",
        definition: "hd",
        contentRating: {},
        projection: "rectangular",
        licensedContent: false,
      },
      channelId: "",
      channelTitle: "",
      videoOwnerChannelId: "",
      videoOwnerChannelTitle: "",
      position: 0,
    };

    expect(typeof entity.publishedAt).toBe("number");
  });

  it("has correct field names matching Datastore schema", () => {
    const entity: EpisodeEntity = {
      title: "Agile Trends 2022",
      description: "O PPT Não Compila...",
      publishedAt: "2022-04-06T13:12:55Z",
      duration: 596,
      playlistId: "UUOvTsuQyJq-fpydse7BY2PQ",
      transcriptionTXT: "é [Música] muito bem...",
      transcriptionSRT: "1\n00:00:00,300 --> 00:00:07,929\né\n",
      thumbnails: {
        default: {
          url: "https://i.ytimg.com/vi/0dexQ7BDHME/default.jpg",
          width: 120,
          height: 90,
        },
        medium: {
          url: "https://i.ytimg.com/vi/0dexQ7BDHME/mqdefault.jpg",
          width: 320,
          height: 180,
        },
        high: {
          url: "https://i.ytimg.com/vi/0dexQ7BDHME/hqdefault.jpg",
          width: 480,
          height: 360,
        },
      },
      resourceId: {
        kind: "youtube#video",
        videoId: "0dexQ7BDHME",
      },
      statistics: {
        commentCount: "1",
        favoriteCount: "0",
        viewCount: "153",
        likeCount: "4",
      },
      contentDetails: {
        caption: "false",
        dimension: "2d",
        duration: "PT9M56S",
        definition: "hd",
        contentRating: {},
        projection: "rectangular",
        licensedContent: true,
      },
      channelId: "UCOvTsuQyJq-fpydse7BY2PQ",
      channelTitle: "PPT Não Compila Tecnologia e Transformação Digital",
      videoOwnerChannelId: "UCOvTsuQyJq-fpydse7BY2PQ",
      videoOwnerChannelTitle: "PPT Não Compila Tecnologia e Transformação Digital",
      position: 2148,
    };

    // Verify real Datastore field names
    expect(entity.transcriptionTXT).toBeDefined();
    expect(entity.transcriptionSRT).toBeDefined();
    expect(entity.resourceId.videoId).toBe("0dexQ7BDHME");
    expect(entity.thumbnails.high.url).toContain("hqdefault");
    expect(entity.statistics.viewCount).toBe("153");
    expect(entity.contentDetails.duration).toBe("PT9M56S");
  });
});

describe("Composite type structures", () => {
  it("EpisodeThumbnails has all resolution levels", () => {
    const thumbnails: EpisodeThumbnails = {
      default: { url: "https://example.com/default.jpg", width: 120, height: 90 },
      medium: { url: "https://example.com/medium.jpg", width: 320, height: 180 },
      high: { url: "https://example.com/high.jpg", width: 480, height: 360 },
    };

    expect(thumbnails.default.width).toBe(120);
    expect(thumbnails.medium.width).toBe(320);
    expect(thumbnails.high.width).toBe(480);
  });

  it("EpisodeStatistics has all counter fields as strings", () => {
    const statistics: EpisodeStatistics = {
      commentCount: "10",
      favoriteCount: "5",
      viewCount: "1000",
      likeCount: "50",
    };

    expect(typeof statistics.commentCount).toBe("string");
    expect(typeof statistics.viewCount).toBe("string");
  });

  it("EpisodeContentDetails has all video metadata", () => {
    const contentDetails: EpisodeContentDetails = {
      caption: "true",
      dimension: "2d",
      duration: "PT10M30S",
      definition: "hd",
      contentRating: {},
      projection: "rectangular",
      licensedContent: true,
    };

    expect(contentDetails.duration).toBe("PT10M30S");
    expect(contentDetails.definition).toBe("hd");
    expect(contentDetails.licensedContent).toBe(true);
  });
});
