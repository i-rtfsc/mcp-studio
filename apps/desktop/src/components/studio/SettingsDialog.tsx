import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { Separator } from '@/components/ui/separator';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { getVersion } from '@tauri-apps/api/app';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { settings, updateSetting } = useAppConfig();
  const [heartbeatInterval, setHeartbeatInterval] = useState<string>('10');
  const [appVersion, setAppVersion] = useState<string>('');

  // Load settings when they change
  useEffect(() => {
    if (settings?.heartbeat_interval) {
      setHeartbeatInterval(settings.heartbeat_interval);
    }
  }, [settings]);

  // Load app version once
  useEffect(() => {
    getVersion().then(setAppVersion).catch(console.error);
  }, []);

  const handleLanguageChange = (value: string) => {
    i18n.changeLanguage(value);
    try {
      localStorage.setItem('language', value);
    } catch {
      // localStorage not available
    }
  };

  const handleHeartbeatIntervalChange = async (value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 5 || numValue > 300) {
      toast.error(t('settings.heartbeatIntervalError'));
      return;
    }

    setHeartbeatInterval(value);
    try {
      await updateSetting({ key: 'heartbeat_interval', value });
      toast.success(t('settings.heartbeatIntervalSuccess'));
    } catch (error) {
      toast.error(t('settings.heartbeatIntervalSaveError'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="space-y-4">
            <h4 className="font-medium leading-none">{t('settings.appearance')}</h4>
            <p className="text-[0.8rem] text-muted-foreground">
              {t('settings.appearanceDescription')}
            </p>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="theme" className="text-right">
                {t('settings.themeMode')}
              </Label>
              <Select value={theme} onValueChange={(val) => setTheme(val as Theme)}>
                <SelectTrigger id="theme" className="col-span-3">
                  <SelectValue placeholder={t('settings.themeMode')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{t('settings.light')}</SelectItem>
                  <SelectItem value="dark">{t('settings.dark')}</SelectItem>
                  <SelectItem value="system">{t('settings.system')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="language" className="text-right">
                {t('settings.languageTitle')}
              </Label>
              <Select value={i18n.language} onValueChange={handleLanguageChange}>
                <SelectTrigger id="language" className="col-span-3">
                  <SelectValue placeholder={t('settings.languageDesc')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-US">English</SelectItem>
                  <SelectItem value="zh-CN">中文</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h4 className="font-medium leading-none">{t('settings.advanced')}</h4>
            <p className="text-[0.8rem] text-muted-foreground">
              {t('settings.advancedDescription')}
            </p>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="heartbeat" className="text-right">
                {t('settings.heartbeatInterval')}
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input
                  id="heartbeat"
                  type="number"
                  min="5"
                  max="300"
                  value={heartbeatInterval}
                  onChange={(e) => setHeartbeatInterval(e.target.value)}
                  onBlur={(e) => handleHeartbeatIntervalChange(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">{t('settings.seconds')}</span>
              </div>
            </div>
            <p className="text-[0.8rem] text-muted-foreground col-span-4">
              {t('settings.heartbeatIntervalDesc')}
            </p>
          </div>
        </div>

        <div className="flex justify-center border-t pt-4">
          <p className="text-xs text-muted-foreground">Version {appVersion || '...'}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
