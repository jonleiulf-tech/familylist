'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function WeeklyReportDialog({ report }: { report: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <FileText className="h-4 w-4" /> Generer ukesrapport
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Ukesrapport</DialogTitle>
        </DialogHeader>
        <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-sm">{report}</pre>
      </DialogContent>
    </Dialog>
  );
}
