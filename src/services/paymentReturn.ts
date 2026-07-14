export type PaymentReturnPayload = {
  bookingId: string;
  flow?: 'booking' | 'final_payment' | 'subscription';
  orderId?: string;
  paymentId?: string;
  signature?: string;
  status?: string;
};

const listeners = new Set<(payload: PaymentReturnPayload) => void>();
let pendingPayload: PaymentReturnPayload | null = null;

export const emitPaymentReturn = (payload: PaymentReturnPayload) => {
  pendingPayload = payload;
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // ignore listener errors
    }
  });
};

export const consumePendingPaymentReturn = () => {
  const payload = pendingPayload;
  pendingPayload = null;
  return payload;
};

export const subscribePaymentReturn = (listener: (payload: PaymentReturnPayload) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
