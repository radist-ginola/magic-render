import type { ProjectSticker } from '../../../shared/domain/stickerTypes';

export type StickerAudioPlan = {
  enabled: boolean;
  mapSpecifier: string;
};

export function buildStickerAudioPlan(sticker: ProjectSticker): StickerAudioPlan {
  return { enabled: !sticker.config.audioMuted, mapSpecifier: '1:a:0?' };
}
