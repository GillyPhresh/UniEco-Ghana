'use client';

import { useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type RegistrationOption = { value: string; label: string };

export function RegistrationOptionPicker({
  id,
  label,
  value,
  options,
  placeholder,
  searchPlaceholder,
  optional = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: RegistrationOption[];
  placeholder: string;
  searchPlaceholder: string;
  optional?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open}
            className="min-h-12 w-full justify-between text-left font-normal touch-manipulation">
            <span className={selected ? 'truncate' : 'truncate text-muted-foreground'}>{selected?.label || placeholder}</span>
            <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
            <CommandList className="max-h-[min(18rem,calc(100dvh-12rem))]">
              <CommandEmpty>No matching option found.</CommandEmpty>
              {options.map((option) => (
                <CommandItem key={option.value} value={option.label}
                  onSelect={() => { onChange(option.value); setOpen(false); }} className="min-h-11">
                  <Check className={`mr-2 h-4 w-4 ${value === option.value ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function registrationStringOptions(values: readonly string[], currentValue?: string): RegistrationOption[] {
  const options = values.map((value) => ({ value, label: value }));
  if (currentValue && !options.some((option) => option.value === currentValue)) {
    options.unshift({ value: currentValue, label: `${currentValue} (saved)` });
  }
  return options;
}
