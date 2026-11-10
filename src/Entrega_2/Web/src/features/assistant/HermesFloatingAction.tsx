import { useState } from 'react';
import { platformHasInstitutionalData } from '@/features/auth/guards';
import { usePlatformInfo } from '@/features/platform/platform';
import { HermesAssistantDialog } from './HermesAssistantDialog';

export function HermesFloatingAction() {
  const [open, setOpen] = useState(false);
  const platform = usePlatformInfo();
  if (import.meta.env.PROD && !platformHasInstitutionalData(platform.data)) return null;
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Abrir assistente virtual Hermes" title="Conversar com o Hermes" className="fixed bottom-5 right-5 z-40 grid h-[68px] w-[68px] place-items-center rounded-full border-2 border-white bg-white shadow-[0_8px_28px_rgba(6,61,48,.20)] ring-1 ring-[#00a875]/40 transition-shadow hover:shadow-[0_10px_34px_rgba(6,61,48,.32)] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#00a875]">
      <img src="/brand/mascot/hermes-fecap.gif" alt="" className="h-full w-full rounded-full bg-white p-2 object-contain" />
      <span className="absolute -left-[158px] top-1/2 hidden -translate-y-1/2 rounded-full bg-white px-3 py-2 text-xs font-bold text-[#063d30] shadow-md sm:block">Assistente virtual</span>
    </button>
    <HermesAssistantDialog open={open} onClose={() => setOpen(false)} />
  </>;
}
