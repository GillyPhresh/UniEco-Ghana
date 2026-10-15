import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <div>
        <h1 className="text-3xl font-bold">Page not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The page you are looking for does not exist.
        </p>
        <Link className="mt-6 inline-block underline" href="/">
          Go to homepage
        </Link>
      </div>
    </main>
  );
}
