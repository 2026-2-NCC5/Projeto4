import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoutes } from '@/test/utils';
import AppDownloadPage, { APP_DOWNLOAD } from './AppDownloadPage';

describe('página de download do app', () => {
  it('oferece o APK e a abertura no Expo Go, com QR codes servidos pelo próprio portal', async () => {
    renderRoutes([{ path: '/', element: <AppDownloadPage /> }]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Leve o ASA Conecta no celular.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Baixar o APK/ })).toHaveAttribute('href', APP_DOWNLOAD.apkUrl);
    expect(screen.getByRole('link', { name: /Abrir no Expo Go/ })).toHaveAttribute('href', expect.stringMatching(/^exp:\/\/u\.expo\.dev\/.+runtime-version=exposdk%3A58\.0\.0$/));
    for (const img of screen.getAllByRole('img', { name: /QR code/ })) expect(img.getAttribute('src')).toMatch(/^\/app\/qr-.+\.svg$/);
  });
});
