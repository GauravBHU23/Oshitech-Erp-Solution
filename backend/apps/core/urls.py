from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminOverviewView,
    AuditLogViewSet,
    PublicSiteOverviewView,
    SiteVisitorView,
    SupportRequestCollectionView,
    SupportRequestDetailView,
)

router = DefaultRouter()
router.register("audit-logs", AuditLogViewSet, basename="audit-log")
urlpatterns = [
    path("site-visitors/", SiteVisitorView.as_view(), name="site-visitors"),
    path("public-overview/", PublicSiteOverviewView.as_view(), name="public-overview"),
    path("support-requests/", SupportRequestCollectionView.as_view(), name="support-requests"),
    path("support-requests/<uuid:request_id>/", SupportRequestDetailView.as_view(), name="support-request-detail"),
    path("admin-overview/", AdminOverviewView.as_view(), name="admin-overview"),
    *router.urls,
]
