import { articleIdentity, publisherHost, sourceLink, publicSourceUrl } from './public-source-url';

export type PhotoStory = { canonical_url?:string; media_url?:string|null; media_type?:string|null };
export function photoHosts(article:URL){
  const host=publisherHost(article.hostname);
  return [host,...(host==='3news.com'?['media.3news.com']:host==='bbc.com'||host==='bbc.co.uk'?['ichef.bbci.co.uk']:[])];
}
export function storyAsset(story:PhotoStory) {
  const article=publicSourceUrl(story.canonical_url);
  if(!article || article.pathname==='/' || story.media_type!=='image')return null;
  const photo=sourceLink(story.media_url,article.href,photoHosts(article));
  if(!photo || !/\.(?:png|jpe?g|webp|avif)$/i.test(photo.pathname) || /(?:favicon|placeholder|\/logo[-.])/i.test(photo.pathname))return null;
  return {article:articleIdentity(article.href),url:photo.href};
}
