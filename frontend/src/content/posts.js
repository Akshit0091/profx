// Blog post accessors. Reads the build-time generated module
// (produced by scripts/build-blog.js from content/blog/*.md).
import generated from './posts.generated';

export const allPosts = generated;
export const postBySlug = (slug) => generated.find((p) => p.slug === slug) || null;
export const allSlugs = () => generated.map((p) => p.slug);
