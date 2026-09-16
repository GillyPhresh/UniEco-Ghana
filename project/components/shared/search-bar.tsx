'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, TrendingUp, Clock, Store } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CATEGORY_ICONS, CATEGORY_KEYWORDS, ALL_CATEGORIES } from '@/lib/constants/categories';
import { cn } from '@/lib/utils';

const POPULAR_SEARCHES = [
  'Food',
  'Printing',
  'Phone repair',
  'Fashion',
  'Books',
  'Smoothies',
];

const RECENT_SEARCHES_KEY = 'unieco_recent_searches';

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentSearches().filter((s) => s !== query);
    recent.unshift(query);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, 5)));
  } catch {
    // ignore
  }
}

function findCategoryMatches(query: string): string[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const matches: string[] = [];
  for (const category of ALL_CATEGORIES) {
    const keywords = CATEGORY_KEYWORDS[category] || [];
    if (category.toLowerCase().includes(q) || keywords.some((kw) => kw.includes(q) || q.includes(kw))) {
      matches.push(category);
    }
  }
  return matches.slice(0, 4);
}

interface SearchBarProps {
  className?: string;
  size?: 'lg' | 'md';
  autoFocus?: boolean;
}

export function SearchBar({ className, size = 'lg', autoFocus }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const categoryMatches = useMemo(() => findCategoryMatches(query), [query]);
  const hasQuery = query.trim().length > 0;
  const showSuggestions = focused && (recentSearches.length > 0 || POPULAR_SEARCHES.length > 0 || categoryMatches.length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    saveRecentSearch(query.trim());
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    saveRecentSearch(suggestion);
    router.push(`/search?q=${encodeURIComponent(suggestion)}`);
  };

  const handleCategoryClick = (category: string) => {
    saveRecentSearch(category);
    router.push(`/discover?category=${encodeURIComponent(category)}`);
    setFocused(false);
  };

  const clearRecent = () => {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
    setRecentSearches([]);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search
            className={cn(
              'absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground',
              size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
            )}
          />
          <Input
            type="text"
            placeholder="Search businesses, products, events..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            autoFocus={autoFocus}
            className={cn(
              'pr-24 border-border bg-background/80 backdrop-blur',
              size === 'lg' ? 'h-14 pl-12 text-base' : 'h-11 pl-10'
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-20 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <Button
            type="submit"
            size={size === 'lg' ? 'default' : 'sm'}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            Search
          </Button>
        </div>
      </form>

      {showSuggestions && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-border bg-popover p-3 shadow-lg">
          {/* Live category matches */}
          {hasQuery && categoryMatches.length > 0 && (
            <div className="mb-3">
              <span className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Store className="h-3 w-3" />
                Browse category
              </span>
              <div className="space-y-1">
                {categoryMatches.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleCategoryClick(cat)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                  >
                    <span className="text-lg">{CATEGORY_ICONS[cat] || '🏪'}</span>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent searches */}
          {recentSearches.length > 0 && (
            <div className="mb-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Recent searches
                </span>
                <button
                  onClick={clearRecent}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestionClick(s)}
                    className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Popular searches (only when no query) */}
          {!hasQuery && (
            <div>
              <span className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                Popular searches
              </span>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_SEARCHES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestionClick(s)}
                    className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
