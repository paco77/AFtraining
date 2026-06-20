import React from 'react';
import { toast } from 'sonner-native';
import { CustomToast } from '../components/CustomToast';

/**
 * Utility to show beautiful custom toasts matching the requested design
 */
export const showToast = {
    success: (message: string) => {
        const id = toast.custom(
            <CustomToast
                type="success"
                message={message}
                onClose={() => toast.dismiss(id)}
            />
        );
    },
    error: (message: string) => {
        const id = toast.custom(
            <CustomToast
                type="error"
                message={message}
                onClose={() => toast.dismiss(id)}
            />
        );
    },
    warning: (message: string) => {
        const id = toast.custom(
            <CustomToast
                type="warning"
                message={message}
                onClose={() => toast.dismiss(id)}
            />
        );
    },
    info: (message: string) => {
        const id = toast.custom(
            <CustomToast
                type="info"
                message={message}
                onClose={() => toast.dismiss(id)}
            />
        );
    }
};
