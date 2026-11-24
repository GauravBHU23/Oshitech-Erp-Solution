from django.urls import path
from rest_framework.routers import DefaultRouter

from . import results, views

router = DefaultRouter()
router.register("admin/exams", views.StreExamViewSet, basename="stre-exam")
router.register("admin/subjects", views.StreSubjectViewSet, basename="stre-subject")
router.register("admin/registrations", views.StreRegistrationAdminViewSet, basename="stre-registration")
router.register("admin/email-logs", views.StreEmailLogViewSet, basename="stre-email-log")
router.register("admin/support", views.StreSupportAdminViewSet, basename="stre-support")
router.register("admin/notices", views.StreNoticeAdminViewSet, basename="stre-notice")

urlpatterns = [
    path("public/", views.PublicInfoView.as_view()),
    path("notices/", views.StrePublicNoticesView.as_view()),
    path("notice-files/<uuid:notice_id>/", views.StreNoticeFileView.as_view()),
    path("support/", views.StreSupportCreateView.as_view()),
    path("register/", views.RegisterView.as_view()),
    path("otp/send/", views.StreOtpSendView.as_view()),
    path("otp/verify/", views.StreOtpVerifyView.as_view()),
    path("captcha/", views.StreCaptchaView.as_view()),
    path("status/", views.StatusView.as_view()),
    path("pay/order/", views.PayOrderView.as_view()),
    path("pay/verify/", views.PayVerifyView.as_view()),
    path("pay/manual/", views.PayManualView.as_view()),
    path("pay/failed/", views.PayFailedView.as_view()),
    path("pay/cashfree-webhook/", views.CashfreeWebhookView.as_view()),
    path("admit-card/<str:token>/download/", views.AdmitCardDownloadView.as_view()),
    path("admit-card/<str:token>/", views.AdmitCardView.as_view()),
    path("files/<str:token>/<str:kind>/", views.CandidateFileView.as_view()),
    path("verify/<str:roll_no>/", views.VerifyRollView.as_view()),
    path("result/", results.PublicResultView.as_view()),
    path("certificate/verify/<str:code>/", results.CertificateVerifyView.as_view()),
    path("admin/results/", results.ResultListView.as_view()),
    path("admin/results/save/", results.ResultSaveView.as_view()),
    path("admin/results/upload/", results.ResultUploadView.as_view()),
    path("admin/results/template/", results.ResultTemplateView.as_view()),
    path("admin/results/publish/", results.ResultPublishView.as_view()),
    path("admin/results/export/", results.ResultExportView.as_view()),
    path("admin/dashboard/", views.StreDashboardView.as_view()),
    path("admin/email/", views.StreEmailStatusView.as_view()),
    path("admin/bulk-email/", views.StreBulkEmailView.as_view()),
    *router.urls,
]
