'use client';

import { useState, useTransition } from 'react';
import { Compass, Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { createDemoProject } from './actions';

export function DemoProjectButton({ variant = 'secondary', size, className, label = 'Utforsk eksempelprosjektet' }: {
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  label?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await createDemoProject();
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}
        {pending ? 'Lager eksempelprosjekt…' : label}
      </Button>
      <FormError message={error} />
    </div>
  );
}
