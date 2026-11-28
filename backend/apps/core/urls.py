from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminEmailView,
    AdminOverviewView,
    AuditLogViewSet,
    PublicSiteOverviewView,
    SiteVisitorView,
    SupportRequestMessagesView,
    SupportRequestCollectionView,
    SupportRequestDetailView,
    WebsiteLiveChatMessagesView,
    WebsiteLiveChatStartView,
)

router = DefaultRouter()
router.register("audit-logs", AuditLogViewSet, basename="audit-log")
urlpatterns = [
    path("admin-email/", AdminEmailView.as_view(), name="admin-email"),
    path("site-visitors/", SiteVisitorView.as_view(), name="site-visitors"),
    path("public-overview/", PublicSiteOverviewView.as_view(), name="public-overview"),
    path("live-chat/", WebsiteLiveChatStartView.as_view(), name="live-chat-start"),
    path("live-chat/<uuid:request_id>/messages/", WebsiteLiveChatMessagesView.as_view(), name="live-chat-messages"),
    path("support-requests/", SupportRequestCollectionView.as_view(), name="support-requests"),
    path("support-requests/<uuid:request_id>/messages/", SupportRequestMessagesView.as_view(), name="support-request-messages"),
    path("support-requests/<uuid:request_id>/", SupportRequestDetailView.as_view(), name="support-request-detail"),
    path("admin-overview/", AdminOverviewView.as_view(), name="admin-overview"),
    *router.urls,
]
