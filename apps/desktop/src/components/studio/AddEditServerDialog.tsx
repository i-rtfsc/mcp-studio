import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useMcpServers, type McpServer, type CreateMcpServerCmd } from '@/hooks/useMcpServers';
import { useAppStore } from '@/lib/store';

interface AddEditServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverToEdit?: McpServer | null;
}

export function AddEditServerDialog({
  open,
  onOpenChange,
  serverToEdit,
}: AddEditServerDialogProps) {
  const { t } = useTranslation();
  const { setActiveServerId } = useAppStore();
  const [formData, setFormData] = useState<CreateMcpServerCmd>({
    name: '',
    url: '',
    server_type: 'streamable_http',
  });
  const { createServer, updateServer } = useMcpServers();

  useEffect(() => {
    if (serverToEdit) {
      setFormData({
        name: serverToEdit.name,
        url: serverToEdit.url,
        server_type: serverToEdit.server_type,
      });
    } else {
      setFormData({ name: '', url: '', server_type: 'streamable_http' });
    }
  }, [serverToEdit, open]); // Reset form when dialog opens or serverToEdit changes

  const handleSave = async () => {
    if (!formData.name || !formData.url) {
      toast.error(t('mcp.servers.form.validation.required'));
      return;
    }

    try {
      if (serverToEdit) {
        await updateServer.mutateAsync({
          id: serverToEdit.id,
          name: formData.name,
          url: formData.url,
          server_type: formData.server_type,
        });
        toast.success(t('mcp.servers.form.updateSuccess'));
      } else {
        // Create new server
        const newServer = await createServer.mutateAsync(formData);
        toast.success(t('mcp.servers.form.success'));
        // Auto-select the newly created server
        setActiveServerId(newServer.id);
      }
      onOpenChange(false); // Close dialog
    } catch (error) {
      toast.error(t('mcp.servers.form.error', { message: String(error) }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {serverToEdit ? t('mcp.servers.dialog.editTitle') : t('mcp.servers.dialog.title')}
          </DialogTitle>
          <DialogDescription>
            {serverToEdit
              ? t('mcp.servers.dialog.editDescription')
              : t('mcp.servers.dialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('mcp.servers.form.name')}</Label>
            <Input
              id="name"
              placeholder={t('mcp.servers.form.namePlaceholder')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="server_type">{t('mcp.servers.form.type')}</Label>
            <Select
              value={formData.server_type}
              onValueChange={(value) =>
                setFormData({ ...formData, server_type: value as 'sse' | 'streamable_http' })
              }
            >
              <SelectTrigger id="server_type">
                <SelectValue placeholder={t('mcp.servers.form.typePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
                <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="url">{t('mcp.servers.form.url')}</Label>
            <Input
              id="url"
              placeholder={t('mcp.servers.form.urlPlaceholder')}
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={createServer.isPending || updateServer.isPending}>
            {createServer.isPending || updateServer.isPending
              ? t('mcp.servers.form.submitting')
              : serverToEdit
                ? t('mcp.servers.form.update')
                : t('mcp.servers.form.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
