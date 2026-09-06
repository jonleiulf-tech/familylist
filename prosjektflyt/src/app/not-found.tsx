import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">Fant ikke siden</h1>
      <p className="text-sm text-muted-foreground">
        Prosjektet eller siden finnes ikke, eller du har ikke tilgang til det.
      </p>
      <Button asChild>
        <Link href="/prosjekter">Til prosjektlisten</Link>
      </Button>
    </div>
  );
}
