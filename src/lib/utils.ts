import { createCn } from 'cn/config';

/**
 * Class-name merging that knows the theme's own tokens (src/index.css): without them `text-label` reads as a colour
 * and is dropped beside `text-text-primary`, and `max-w-page` isn't recognised as a max width.
 */
export const cn = createCn({
  extend: {
    theme: {
      text: ['label', 'caption', 'body', 'heading', 'title', 'display'],
      container: ['page', 'detail', 'connect'],
      radius: ['card'],
      shadow: ['card'],
      spacing: ['check'],
    },
  },
});
