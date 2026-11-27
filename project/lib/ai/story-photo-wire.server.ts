import 'server-only';
import {lookupPublisherItem} from './publisher-wire.server';
import {storyAsset,type PhotoStory} from './story-photo';
import {publicSourceUrl,publisherHost} from './public-source-url';

// Some older moderated records kept the article but not its publisher-CDN thumbnail.
// Use the same article from the verified feed, never a headline/keyword image search.
export async function withWirePhoto<T extends PhotoStory>(story:T):Promise<T>{
 if(storyAsset(story)||!story.canonical_url)return story;
 const article=publicSourceUrl(story.canonical_url);
 if(!article||!['3news.com','myjoyonline.com','bbc.com','bbc.co.uk','opportunitiesforyouth.org','daad-ghana.org'].includes(publisherHost(article.hostname)))return story;
 const row=await lookupPublisherItem(article.href);
 if(!row?.thumbnail)return story;
 const candidate={...story,media_url:row.thumbnail,media_type:'image' as const};
 return storyAsset(candidate)?candidate:story;
}
