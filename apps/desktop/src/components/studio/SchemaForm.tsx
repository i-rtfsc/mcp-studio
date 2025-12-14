import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface SchemaFormProps {
  schema: string | null;
  value: string; // JSON string
  onChange: (value: string) => void;
}

export function SchemaForm({ schema, value, onChange }: SchemaFormProps) {
  const [parsedSchema, setParsedSchema] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});

  // Parse schema and initial value
  useEffect(() => {
    if (!schema) return;
    try {
      setParsedSchema(JSON.parse(schema));
    } catch (e) {
      console.error("Invalid schema JSON", e);
    }
  }, [schema]);

  // Sync internal form state with external JSON value string
  useEffect(() => {
    try {
      const json = JSON.parse(value);
      setFormData(json);
    } catch {
      // If external value is invalid JSON, ignore (user might be typing in raw mode)
    }
  }, [value]);

  const handleFieldChange = (key: string, fieldValue: any) => {
    const newFormData = { ...formData, [key]: fieldValue };
    setFormData(newFormData);
    onChange(JSON.stringify(newFormData, null, 2));
  };

  if (!parsedSchema || !parsedSchema.properties) {
    return (
      <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-lg border border-dashed">
        No parameters required for this tool.
      </div>
    );
  }

  const { properties, required } = parsedSchema;
  // Sort: required fields first, then alphabetical
  const sortedKeys = Object.keys(properties).sort((a, b) => {
    const isARequired = required?.includes(a);
    const isBRequired = required?.includes(b);
    if (isARequired && !isBRequired) return -1;
    if (!isARequired && isBRequired) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-4 p-1">
      {sortedKeys.map((key) => {
        const prop = properties[key];
        const isRequired = required?.includes(key);
        
        // Handle types
        let type = prop.type;
        // Handle anyOf/oneOf if type is missing (simple heuristic)
        if (!type && (prop.anyOf || prop.oneOf)) {
           const variants = prop.anyOf || prop.oneOf;
           const nonNull = variants.find((v: any) => v.type !== 'null');
           if (nonNull) type = nonNull.type;
        }

        const label = (
          <Label className={cn("text-sm mb-1.5 block", isRequired && "font-semibold text-primary")}>
            {key}
            {isRequired && <span className="text-red-500 ml-0.5">*</span>}
            <span className="ml-2 text-xs font-normal text-muted-foreground/70">
              {type}
            </span>
          </Label>
        );

        const description = prop.description && (
          <p className="text-[10px] text-muted-foreground mb-2">{prop.description}</p>
        );

        // Render based on type
        if (type === 'boolean') {
          return (
            <div key={key} className="flex items-center justify-between border rounded-lg p-3 bg-card/50">
              <div className="space-y-0.5">
                {label}
                {description}
              </div>
              <Switch
                checked={!!formData[key]}
                onCheckedChange={(checked) => handleFieldChange(key, checked)}
              />
            </div>
          );
        }

        if (prop.enum) {
           return (
            <div key={key} className="space-y-1">
              {label}
              <Select
                value={formData[key]?.toString()}
                onValueChange={(val) => handleFieldChange(key, val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${key}`} />
                </SelectTrigger>
                <SelectContent>
                  {prop.enum.map((option: any) => (
                    <SelectItem key={String(option)} value={String(option)}>
                      {String(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {description}
            </div>
           );
        }

        if (type === 'integer' || type === 'number') {
          return (
            <div key={key} className="space-y-1">
              {label}
              <Input
                type="number"
                placeholder={String(prop.default || '')}
                value={formData[key] ?? ''}
                onChange={(e) => {
                   const val = e.target.value;
                   handleFieldChange(key, val === '' ? undefined : Number(val));
                }}
              />
              {description}
            </div>
          );
        }

        // Default to Text Input for strings
        if (type === 'string') {
          return (
            <div key={key} className="space-y-1">
              {label}
              <Input
                placeholder={String(prop.default || '')}
                value={formData[key] ?? ''}
                onChange={(e) => handleFieldChange(key, e.target.value)}
              />
              {description}
            </div>
          );
        }

        // Fallback for arrays/objects: Textarea
        return (
          <div key={key} className="space-y-1">
            {label}
            <Textarea
              className="font-mono text-xs h-20"
              placeholder="{ ... }"
              value={typeof formData[key] === 'object' ? JSON.stringify(formData[key], null, 2) : formData[key] ?? ''}
              onChange={(e) => {
                try {
                   const parsed = JSON.parse(e.target.value);
                   handleFieldChange(key, parsed);
                } catch {
                   // Just update the string if invalid JSON (won't save correctly to object though, logic limitation for MVP)
                   // Ideally we keep a local string state for this field
                }
              }}
            />
            <p className="text-[10px] text-yellow-500/80">Complex type: enter valid JSON</p>
            {description}
          </div>
        );
      })}
    </div>
  );
}
