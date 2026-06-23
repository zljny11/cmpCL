#!/usr/bin/env python3
"""
Create a realistic but lightweight test checkpoint for the encrypted delivery flow.

Outputs:
1. A PyTorch checkpoint `.pth`
2. A matching `license.txt` containing a base64 32-byte key
3. A JSON snippet that can be copied into `license/user-licenses.json`
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import torch
from torch import nn


@dataclass
class TestCheckpointMetadata:
    model_name: str
    model_version: str
    modality: str
    body_part: str
    input_shape: list[int]
    class_names: list[str]
    normalization: dict[str, list[float]]
    training_summary: dict[str, float | int | str]
    created_at: str


class TinyDeliveryNet(nn.Module):
    """Small CNN with realistic parameter names for delivery-chain testing."""

    def __init__(self, num_classes: int = 3) -> None:
        super().__init__()
        self.backbone = nn.Sequential(
            nn.Conv2d(1, 8, kernel_size=3, stride=1, padding=1),
            nn.BatchNorm2d(8),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2),
            nn.Conv2d(8, 16, kernel_size=3, stride=1, padding=1),
            nn.BatchNorm2d(16),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d((1, 1)),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(16, 12),
            nn.ReLU(inplace=True),
            nn.Dropout(p=0.1),
            nn.Linear(12, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        features = self.backbone(x)
        return self.classifier(features)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create test assets for the model delivery chain")
    parser.add_argument(
        "--output-dir",
        default="test-assets/delivery",
        help="Directory where the test checkpoint and license assets will be written",
    )
    parser.add_argument(
        "--user-id",
        default="demo-user-id",
        help="User id to use in the generated user-licenses JSON snippet",
    )
    parser.add_argument(
        "--checkpoint-name",
        default="campcloud_delivery_test_checkpoint.pth",
        help="Output checkpoint file name",
    )
    parser.add_argument(
        "--license-name",
        default="license.txt",
        help="Output license file name",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=20260618,
        help="Random seed for deterministic checkpoint weights",
    )
    return parser.parse_args()


def build_checkpoint() -> dict[str, object]:
    model = TinyDeliveryNet(num_classes=3)
    state_dict = model.state_dict()
    metadata = TestCheckpointMetadata(
        model_name="tiny-lung-lesion-classifier",
        model_version="test-v1",
        modality="CT",
        body_part="Chest",
        input_shape=[1, 1, 256, 256],
        class_names=["benign", "indeterminate", "malignant"],
        normalization={
            "mean": [0.482],
            "std": [0.233],
        },
        training_summary={
            "epoch": 12,
            "best_val_auc": 0.9134,
            "best_val_loss": 0.2841,
            "train_samples": 1840,
            "val_samples": 420,
            "framework": "pytorch",
        },
        created_at=datetime.now(UTC).isoformat(),
    )
    return {
        "state_dict": state_dict,
        "meta": asdict(metadata),
        "inference": {
            "task": "multi_class_classification",
            "output_key": "logits",
            "recommended_thresholds": [0.35, 0.5, 0.65],
        },
    }


def main() -> None:
    args = parse_args()
    torch.manual_seed(args.seed)

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    checkpoint_path = output_dir / args.checkpoint_name
    license_path = output_dir / args.license_name
    user_license_path = output_dir / "user-licenses.generated.json"

    checkpoint = build_checkpoint()
    torch.save(checkpoint, checkpoint_path)

    license_key = base64.b64encode(os.urandom(32)).decode("utf-8")
    license_path.write_text(f"{license_key}\n", encoding="utf-8")

    user_license_payload = {
        "users": {
            str(args.user_id): license_key,
        },
    }
    user_license_path.write_text(
        json.dumps(user_license_payload, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )

    print("Created test delivery assets:")
    print(f"  checkpoint: {checkpoint_path}")
    print(f"  license:    {license_path}")
    print(f"  config:     {user_license_path}")
    print("")
    print("Server-side note:")
    print("  Copy the generated users entry into license/user-licenses.json")
    print("  and replace the placeholder user id with the real target user id if needed.")


if __name__ == "__main__":
    main()
