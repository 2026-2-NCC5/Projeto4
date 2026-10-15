export { NavigationProvider, useAppNavigation, useOptionalAppNavigation, type AppNavigation } from './AppNavigator';
export { actionForTarget, currentScreenKey, INITIAL_NAVIGATION_STATE, isSupportRoute, navigationReducer, QUEUE_ROUTE, supportRoutes, type NavigationAction, type NavigationState } from './navigationReducer';
// ---- appointments (Agendamentos com o ASA) · notifications (Central de avisos)
export { appointmentRoutes, isAppointmentRoute, NOTIFICATIONS_ROUTE } from './navigationReducer';
export { SCREEN_LABELS, TAB_LABELS, type AcademicSegment, type AppointmentRoute, type DetailRoute, type ScreenKey, type SupportListFilter, type SupportRoute, type TabKey } from './routes';
