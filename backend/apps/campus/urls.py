from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("notices", views.NoticeViewSet, basename="notice")
router.register("timetable", views.TimetableViewSet, basename="timetable")
router.register("homework", views.HomeworkViewSet, basename="homework")
router.register("leave-requests", views.LeaveRequestViewSet, basename="leave-request")
router.register("fee-structures", views.FeeStructureViewSet, basename="fee-structure")
router.register("fee-invoices", views.FeeInvoiceViewSet, basename="fee-invoice")
router.register("fee-payments", views.FeePaymentViewSet, basename="fee-payment")
urlpatterns = [path("public-notices/", views.PublicNoticesView.as_view(), name="public-notices"), path("notice-files/<uuid:notice_id>/", views.NoticeFileView.as_view(), name="notice-file"), *router.urls]
